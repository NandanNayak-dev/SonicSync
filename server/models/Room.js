import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema({
  socketId: { type: String, required: true },
  name: { type: String, required: true },
  device: { type: String, default: 'Mobile Device' },
  isHost: { type: Boolean, default: false },
  joinedAt: { type: Date, default: Date.now },
  latencyMs: { type: Number, default: 0 },
  ready: { type: Boolean, default: true },
  audioBuffered: { type: Boolean, default: false },
  hardwareCalibrationMs: { type: Number, default: 0 }
});

const trackSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  artist: { type: String, default: 'BeatSync Artist' },
  url: { type: String, required: true },
  duration: { type: Number, default: 0 },
  addedBy: { type: String, default: 'Host' },
  addedAt: { type: Date, default: Date.now }
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
  playlist: [trackSchema],
  state: {
    isPlaying: { type: Boolean, default: false },
    currentTime: { type: Number, default: 0 },
    currentTrack: {
      type: trackSchema,
      default: null
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
