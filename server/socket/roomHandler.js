import { roomStore } from '../roomStore.js';

export function setupRoomSocket(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Create a new room
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

        console.log(`[Room Created] Code: ${room.roomCode} | Host: ${room.hostName} (${socket.id})`);

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

    // Join an existing room
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
            error: `Room "${cleanCode}" was not found. Please verify the code or ask the host.` 
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

        console.log(`[Room Joined] Code: ${cleanCode} | User: ${result.participant.name} (${socket.id})`);

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

    // High-precision NTP-style Time Synchronization Ping
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

    // Update participant's measured latency
    socket.on('room:update_latency', ({ latencyMs }) => {
      const room = roomStore.updateLatency(socket.id, latencyMs);
      if (room) {
        const roomChannel = `room_${room.roomCode}`;
        io.to(roomChannel).emit('room:participants_updated', {
          participants: room.participants
        });
      }
    });

    // User explicitly leaves room
    socket.on('room:leave', (callback) => {
      handleSocketLeave(socket, io);
      if (typeof callback === 'function') {
        callback({ success: true });
      }
    });

    // Disconnect event
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} (reason: ${reason})`);
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
    console.log(`[Room Closed] ${roomCode} has no remaining participants and was cleaned up.`);
    io.to(roomChannel).emit('room:closed', {
      message: 'The room has been closed because all participants left.'
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
