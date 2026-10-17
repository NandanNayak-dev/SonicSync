import { roomStore } from '../roomStore.js';

export function setupRoomSocket(io) {
  io.on('connection', (socket) => {
    // 1. Create room
    socket.on('room:create', (data, callback) => {
      try {
        const { roomName, userName, device } = data || {};
        const room = roomStore.createRoom({
          roomName,
          hostSocketId: socket.id,
          hostName: userName || 'Host',
          device: device || 'Host Browser'
        });

        const roomChannel = `room_${room.roomCode}`;
        socket.join(roomChannel);

        console.log(`[Room Created] Code: ${room.roomCode} | Host: ${room.hostName}`);

        if (typeof callback === 'function') {
          callback({
            success: true,
            room,
            isHost: true,
            message: `Room ${room.roomCode} created successfully!`
          });
        }
      } catch (err) {
        console.error('[Socket] room:create error:', err);
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Failed to create room' });
        }
      }
    });

    // 2. Join room
    socket.on('room:join', (data, callback) => {
      try {
        const { roomCode, userName, device } = data || {};
        if (!roomCode) {
          return callback && callback({ success: false, error: 'Room code is required' });
        }

        const cleanCode = roomCode.toUpperCase().trim();
        const existingRoom = roomStore.getRoom(cleanCode);

        if (!existingRoom) {
          return callback && callback({ 
            success: false, 
            error: `Room "${cleanCode}" not found. Verify the code or ask the host.` 
          });
        }

        const result = roomStore.addParticipant(cleanCode, {
          socketId: socket.id,
          name: userName || `Listener ${existingRoom.participants.length + 1}`,
          device: device || 'Mobile Listener'
        });

        if (!result) {
          return callback && callback({ success: false, error: 'Could not join room' });
        }

        const roomChannel = `room_${cleanCode}`;
        socket.join(roomChannel);

        const isHost = result.room.hostSocketId === socket.id;

        console.log(`[Room Joined] Code: ${cleanCode} | User: ${result.participant.name}`);

        // Notify other room members
        socket.to(roomChannel).emit('room:participant_joined', {
          participant: result.participant,
          room: result.room
        });

        if (typeof callback === 'function') {
          callback({
            success: true,
            room: result.room,
            participant: result.participant,
            isHost,
            message: `Joined room ${cleanCode}!`
          });
        }
      } catch (err) {
        console.error('[Socket] room:join error:', err);
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Internal error while joining room' });
        }
      }
    });

    // 3. High-precision NTP-style Time Synchronization Ping
    socket.on('sync:ping', (data, callback) => {
      const serverReceiveTime = Date.now();
      const clientSendTime = data?.clientSendTime || serverReceiveTime;
      const serverSendTime = Date.now();

      if (typeof callback === 'function') {
        callback({
          clientSendTime,
          serverReceiveTime,
          serverSendTime
        });
      }
    });

    // 4. Update participant's measured latency
    socket.on('room:update_latency', ({ latencyMs }) => {
      const room = roomStore.updateLatency(socket.id, latencyMs);
      if (room) {
        io.to(`room_${room.roomCode}`).emit('room:participants_updated', {
          participants: room.participants
        });
      }
    });

    // 5. Phone reports audio buffer loaded and primed
    socket.on('playback:buffer_ready', ({ audioBuffered }) => {
      const room = roomStore.setParticipantBuffered(socket.id, audioBuffered);
      if (room) {
        io.to(`room_${room.roomCode}`).emit('room:participants_updated', {
          participants: room.participants
        });
      }
    });

    // 6. Device hardware delay calibration offset (e.g. bluetooth latency)
    socket.on('playback:set_calibration', ({ calibrationMs }) => {
      const room = roomStore.setParticipantCalibration(socket.id, calibrationMs);
      if (room) {
        io.to(`room_${room.roomCode}`).emit('room:participants_updated', {
          participants: room.participants
        });
      }
    });

    // 7. Host selects track
    socket.on('playback:load_track', ({ track }, callback) => {
      const room = roomStore.getRoomBySocketId(socket.id);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) {
        return callback && callback({ success: false, error: 'Only the host can change tracks.' });
      }

      const updatedRoom = roomStore.loadTrack(room.roomCode, track);
      io.to(`room_${room.roomCode}`).emit('playback:track_changed', {
        track,
        room: updatedRoom
      });

      if (typeof callback === 'function') callback({ success: true, room: updatedRoom });
    });

    // 8. Host triggers Play -> Schedules synchronized future execution
    socket.on('playback:play', ({ position = 0 }, callback) => {
      const room = roomStore.getRoomBySocketId(socket.id);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) {
        return callback && callback({ success: false, error: 'Only the host can control playback.' });
      }

      // Schedule start 750ms in future for all nodes to schedule hardware clocks reliably
      const SCHEDULE_LEAD_MS = 750;
      const scheduledStartTime = Date.now() + SCHEDULE_LEAD_MS;

      const updatedRoom = roomStore.setPlaybackState(room.roomCode, {
        isPlaying: true,
        currentTime: position,
        scheduledStartTime,
        playbackStartedAtServerTime: scheduledStartTime
      });

      console.log(`[Playback Play] Room ${room.roomCode} scheduled for ${scheduledStartTime} (in ${SCHEDULE_LEAD_MS}ms) at pos ${position}s`);

      io.to(`room_${room.roomCode}`).emit('playback:start_scheduled', {
        scheduledStartTime,
        position,
        track: updatedRoom.state.currentTrack,
        room: updatedRoom
      });

      if (typeof callback === 'function') callback({ success: true });
    });

    // 9. Host triggers Pause
    socket.on('playback:pause', ({ position = 0 }, callback) => {
      const room = roomStore.getRoomBySocketId(socket.id);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) {
        return callback && callback({ success: false, error: 'Only the host can pause.' });
      }

      const updatedRoom = roomStore.setPlaybackState(room.roomCode, {
        isPlaying: false,
        currentTime: position,
        scheduledStartTime: null,
        playbackStartedAtServerTime: null
      });

      console.log(`[Playback Pause] Room ${room.roomCode} paused at position ${position}s`);

      io.to(`room_${room.roomCode}`).emit('playback:paused', {
        position,
        room: updatedRoom
      });

      if (typeof callback === 'function') callback({ success: true });
    });

    // 10. Host triggers Seek
    socket.on('playback:seek', ({ position = 0 }, callback) => {
      const room = roomStore.getRoomBySocketId(socket.id);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) {
        return callback && callback({ success: false, error: 'Only the host can seek.' });
      }

      const wasPlaying = room.state.isPlaying;
      let scheduledStartTime = null;

      if (wasPlaying) {
        scheduledStartTime = Date.now() + 750;
      }

      const updatedRoom = roomStore.setPlaybackState(room.roomCode, {
        currentTime: position,
        scheduledStartTime,
        playbackStartedAtServerTime: scheduledStartTime
      });

      console.log(`[Playback Seek] Room ${room.roomCode} seeked to ${position}s (wasPlaying: ${wasPlaying})`);

      io.to(`room_${room.roomCode}`).emit('playback:seeked', {
        position,
        isPlaying: wasPlaying,
        scheduledStartTime,
        room: updatedRoom
      });

      if (typeof callback === 'function') callback({ success: true });
    });

    // 11. Add track to collaborative playlist
    socket.on('playback:add_track', ({ track }, callback) => {
      const room = roomStore.getRoomBySocketId(socket.id);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });

      const updatedRoom = roomStore.addTrackToPlaylist(room.roomCode, track);
      io.to(`room_${room.roomCode}`).emit('playback:playlist_updated', {
        playlist: updatedRoom.playlist,
        currentTrack: updatedRoom.state.currentTrack
      });

      if (typeof callback === 'function') callback({ success: true, room: updatedRoom });
    });

    // 12. User explicitly leaves room
    socket.on('room:leave', (callback) => {
      handleSocketLeave(socket, io);
      if (typeof callback === 'function') {
        callback({ success: true });
      }
    });

    // 13. Disconnect
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
      handleSocketLeave(socket, io);
    });
  });
}

function handleSocketLeave(socket, io) {
  const result = roomStore.removeParticipantBySocketId(socket.id);
  if (!result) return;

  const { room, roomCode, roomDeleted, leavingParticipant, hostChanged, newHost } = result;
  const roomChannel = `room_${roomCode}`;

  if (roomDeleted) {
    console.log(`[Room Closed] ${roomCode} closed.`);
    io.to(roomChannel).emit('room:closed', {
      message: 'The room was closed because all participants left.'
    });
  } else if (room) {
    console.log(`[Room Member Left] ${leavingParticipant?.name || socket.id} left room ${roomCode}`);
    io.to(roomChannel).emit('room:participant_left', {
      participantId: socket.id,
      participantName: leavingParticipant?.name,
      room,
      hostChanged,
      newHost
    });
  }
}
