const mongoose = require('mongoose');
const { Schema } = mongoose;

// User Schema
const userSchema = new Schema({
  username: { type: String, required: true },
  location: String,
  userId: { type: String, required: true, unique: true },
  socketId: String,
});

// Room Schema
const roomSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['public', 'private', 'secret'], required: true },
  layout: { type: String, enum: ['horizontal', 'vertical'], required: true },
  users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  privateRoomCode: String,
});

// Message Schema
const messageSchema = new Schema({
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);
const Room = mongoose.model('Room', roomSchema);
const Message = mongoose.model('Message', messageSchema);

module.exports = { User, Room, Message };
