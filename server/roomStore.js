import { Room } from './models/Room.js';

class RoomStore {
  constructor() {
    this.rooms = new Map(); // roomCode -> room object
    this.socketToRoom = new Map(); // socketId -> roomCode
    this.isMongoConnected = false;
    this.presetTracks = [];
  }

  setMongoConnected(connected) {
    this.isMongoConnected = connected;
  }

  setPresetTracks(tracks) {
    this.presetTracks = tracks;
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (this.rooms.has(code)) {
      return this.generateRoomCode();
    }
    return code;
  }

  createRoom({ roomName, hostSocketId, hostName, device = 'Host Device' }) {
    const roomCode = this.generateRoomCode();
    const hostParticipant = {
      socketId: hostSocketId,
      name: hostName || 'Host',
      device: device,
      isHost: true,
      joinedAt: new Date().toISOString(),
      latencyMs: 0,
      ready: true,
      audioBuffered: false,
      hardwareCalibrationMs: 0
    };

    const initialPlaylist = [...this.presetTracks];
    const initialTrack = initialPlaylist.length > 0 ? initialPlaylist[0] : null;

    const room = {
      roomCode,
      roomName: roomName || `${hostName}'s Sonic Room`,
      hostSocketId,
      hostName: hostName || 'Host',
      participants: [hostParticipant],
      playlist: initialPlaylist,
      state: {
        isPlaying: false,
        currentTime: 0,
        currentTrack: initialTrack,
        playbackStartedAtServerTime: null,
        scheduledStartTime: null
      },
      createdAt: new Date().toISOString()
    };

    this.rooms.set(roomCode, room);
    this.socketToRoom.set(hostSocketId, roomCode);

    if (this.isMongoConnected) {
      Room.create(room).catch(err => console.warn('[MongoDB] Room save warning:', err.message));
    }

    return room;
  }

  getRoom(roomCode) {
    if (!roomCode) return null;
    return this.rooms.get(roomCode.toUpperCase().trim()) || null;
  }

  getRoomBySocketId(socketId) {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return null;
    return this.getRoom(roomCode);
  }

  addParticipant(roomCode, { socketId, name, device = 'Mobile Listener' }) {
    const code = roomCode.toUpperCase().trim();
    const room = this.rooms.get(code);
    if (!room) return null;

    const existingIndex = room.participants.findIndex(p => p.socketId === socketId);
    const participant = {
      socketId,
      name: name || `Listener ${room.participants.length + 1}`,
      device: device,
      isHost: false,
      joinedAt: new Date().toISOString(),
      latencyMs: 0,
      ready: true,
      audioBuffered: false,
      hardwareCalibrationMs: 0
    };

    if (existingIndex >= 0) {
      room.participants[existingIndex] = participant;
    } else {
      room.participants.push(participant);
    }

    this.socketToRoom.set(socketId, code);

    if (this.isMongoConnected) {
      Room.updateOne({ roomCode: code }, { $set: { participants: room.participants } })
        .catch(err => console.warn('[MongoDB] Participant update warning:', err.message));
    }

    return { room, participant };
  }

  updateLatency(socketId, latencyMs) {
    const room = this.getRoomBySocketId(socketId);
    if (!room) return null;

    const participant = room.participants.find(p => p.socketId === socketId);
    if (participant) {
      participant.latencyMs = latencyMs;
    }
    return room;
  }

  setParticipantBuffered(socketId, audioBuffered) {
    const room = this.getRoomBySocketId(socketId);
    if (!room) return null;

    const participant = room.participants.find(p => p.socketId === socketId);
    if (participant) {
      participant.audioBuffered = Boolean(audioBuffered);
    }
    return room;
  }

  setParticipantCalibration(socketId, calibrationMs) {
    const room = this.getRoomBySocketId(socketId);
    if (!room) return null;

    const participant = room.participants.find(p => p.socketId === socketId);
    if (participant) {
      participant.hardwareCalibrationMs = Number(calibrationMs) || 0;
    }
    return room;
  }

  loadTrack(roomCode, track) {
    const room = this.getRoom(roomCode);
    if (!room) return null;

    room.state.currentTrack = track;
    room.state.currentTime = 0;
    room.state.isPlaying = false;
    room.state.playbackStartedAtServerTime = null;
    room.state.scheduledStartTime = null;

    // Reset buffer readiness for all participants so they can re-buffer
    room.participants.forEach(p => {
      p.audioBuffered = false;
    });

    if (this.isMongoConnected) {
      Room.updateOne(
        { roomCode: room.roomCode },
        { 
          $set: { 
            'state.currentTrack': track,
            'state.currentTime': 0,
            'state.isPlaying': false,
            participants: room.participants
          } 
        }
      ).catch(() => {});
    }

    return room;
  }

  addTrackToPlaylist(roomCode, track) {
    const room = this.getRoom(roomCode);
    if (!room) return null;

    room.playlist.push(track);

    // If no track currently loaded, load this one
    if (!room.state.currentTrack) {
      room.state.currentTrack = track;
    }

    if (this.isMongoConnected) {
      Room.updateOne(
        { roomCode: room.roomCode },
        { $set: { playlist: room.playlist, 'state.currentTrack': room.state.currentTrack } }
      ).catch(() => {});
    }

    return room;
  }

  setPlaybackState(roomCode, { isPlaying, currentTime, scheduledStartTime, playbackStartedAtServerTime }) {
    const room = this.getRoom(roomCode);
    if (!room) return null;

    if (isPlaying !== undefined) room.state.isPlaying = Boolean(isPlaying);
    if (currentTime !== undefined) room.state.currentTime = Number(currentTime);
    if (scheduledStartTime !== undefined) room.state.scheduledStartTime = scheduledStartTime;
    if (playbackStartedAtServerTime !== undefined) room.state.playbackStartedAtServerTime = playbackStartedAtServerTime;

    if (this.isMongoConnected) {
      Room.updateOne(
        { roomCode: room.roomCode },
        { $set: { state: room.state } }
      ).catch(() => {});
    }

    return room;
  }

  removeParticipantBySocketId(socketId) {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return null;

    this.socketToRoom.delete(socketId);
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const leavingParticipant = room.participants.find(p => p.socketId === socketId);
    room.participants = room.participants.filter(p => p.socketId !== socketId);

    let hostChanged = false;
    let newHost = null;

    if (room.hostSocketId === socketId) {
      if (room.participants.length > 0) {
        room.participants[0].isHost = true;
        room.hostSocketId = room.participants[0].socketId;
        room.hostName = room.participants[0].name;
        hostChanged = true;
        newHost = room.participants[0];
      } else {
        this.rooms.delete(roomCode);
        if (this.isMongoConnected) {
          Room.deleteOne({ roomCode }).catch(() => {});
        }
        return { roomCode, roomDeleted: true, leavingParticipant };
      }
    }

    if (this.isMongoConnected) {
      Room.updateOne(
        { roomCode },
        { 
          $set: { 
            participants: room.participants,
            hostSocketId: room.hostSocketId,
            hostName: room.hostName
          } 
        }
      ).catch(() => {});
    }

    return {
      room,
      roomCode,
      roomDeleted: false,
      leavingParticipant,
      hostChanged,
      newHost
    };
  }

  getAllRooms() {
    return Array.from(this.rooms.values());
  }
}

export const roomStore = new RoomStore();
