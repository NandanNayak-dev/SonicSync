// Hybrid In-Memory & MongoDB room store for high performance and zero-config local testing
import { Room } from './models/Room.js';

class RoomStore {
  constructor() {
    this.rooms = new Map(); // roomCode -> room object
    this.socketToRoom = new Map(); // socketId -> roomCode
    this.isMongoConnected = false;
  }

  setMongoConnected(connected) {
    this.isMongoConnected = connected;
  }

  // Generate clean, readable 6-character room code (e.g., SYNC42, BEAT88)
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars like I, 1, O, 0
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
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
      ready: true
    };

    const room = {
      roomCode,
      roomName: roomName || `${hostName}'s Sonic Room`,
      hostSocketId,
      hostName: hostName || 'Host',
      participants: [hostParticipant],
      state: {
        isPlaying: false,
        currentTime: 0,
        currentTrack: null,
        playbackStartedAtServerTime: null
      },
      createdAt: new Date().toISOString()
    };

    this.rooms.set(roomCode, room);
    this.socketToRoom.set(hostSocketId, roomCode);

    // Async save to MongoDB if connected
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

    // Check if participant already exists by socketId
    const existingIndex = room.participants.findIndex(p => p.socketId === socketId);
    const participant = {
      socketId,
      name: name || `Listener ${room.participants.length + 1}`,
      device: device,
      isHost: false,
      joinedAt: new Date().toISOString(),
      latencyMs: 0,
      ready: true
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

    // If host left and there are other participants, promote the first one to host
    if (room.hostSocketId === socketId) {
      if (room.participants.length > 0) {
        room.participants[0].isHost = true;
        room.hostSocketId = room.participants[0].socketId;
        room.hostName = room.participants[0].name;
        hostChanged = true;
        newHost = room.participants[0];
      } else {
        // Room is empty, delete it
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
