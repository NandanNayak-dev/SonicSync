import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema({
  socketId: { type: String, required: true },
  name: { type: String, required: true },
  device: { type: String, default: 'Mobile Device' },
  isHost: { type: Boolean, default: false },
  joinedAt: { type: Date, default: Date.now },
  latencyMs: { type: Number, default: 0 },
  ready: { type: Boolean, default: true }
});

const roomSchema = new mongoose.Schema({
  roomCode: { 
    type: String, 
    required: true, 
    unique: true, 
    uppercase: true, 
    trim: true,
    index: true 
  },
  roomName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  hostSocketId: { 
    type: String, 
    required: true 
  },
  hostName: { 
    type: String, 
    required: true 
  },
  participants: [participantSchema],
  state: {
    isPlaying: { type: Boolean, default: false },
    currentTime: { type: Number, default: 0 },
    currentTrack: {
      title: { type: String, default: null },
      url: { type: String, default: null },
      duration: { type: Number, default: 0 }
    },
    playbackStartedAtServerTime: { type: Number, default: null }
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    expires: 86400 // Automatically expire after 24 hours
  }
});

export const Room = mongoose.model('Room', roomSchema);
