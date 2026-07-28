const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const game = require("./game");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// roomId -> room
const rooms = new Map();

function makeRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id;
  do {
    id = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(id));
  return id;
}

function getRoom(roomId) {
  return rooms.get((roomId || "").toUpperCase());
}

// Send each connected player their personalized view of the state.
function broadcastState(room) {
  if (!room.state) return;
  for (const player of room.players) {
    if (player.socketId) {
      io.to(player.socketId).emit("state", game.serialize(room.state, player.id));
    }
  }
}

function lobbyInfo(room) {
  return {
    roomId: room.id,
    players: room.players.map((p) => ({ name: p.name, connected: !!p.socketId })),
    started: !!room.state,
  };
}

function broadcastLobby(room) {
  io.to(room.id).emit("lobby", lobbyInfo(room));
}

io.on("connection", (socket) => {
  let currentRoomId = null;
  let currentPlayerId = null;

  socket.on("createRoom", ({ name }, cb) => {
    const roomId = makeRoomId();
    const playerId = socket.id + ":host";
    const room = {
      id: roomId,
      players: [{ id: playerId, name: (name || "Player 1").slice(0, 16), socketId: socket.id }],
      state: null,
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    currentRoomId = roomId;
    currentPlayerId = playerId;
    cb({ ok: true, roomId, playerId });
    broadcastLobby(room);
  });

  socket.on("joinRoom", ({ roomId, name }, cb) => {
    const room = getRoom(roomId);
    if (!room) return cb({ ok: false, error: "Room not found." });

    // Reconnect to an existing seat that is missing its socket.
    const openSeat = room.players.find((p) => !p.socketId);
    if (room.players.length >= 2 && !openSeat) {
      return cb({ ok: false, error: "Room is full." });
    }

    let player;
    if (room.players.length < 2) {
      player = {
        id: socket.id + ":guest",
        name: (name || `Player ${room.players.length + 1}`).slice(0, 16),
        socketId: socket.id,
      };
      room.players.push(player);
    } else {
      player = openSeat;
      player.socketId = socket.id;
    }

    socket.join(room.id);
    currentRoomId = room.id;
    currentPlayerId = player.id;
    cb({ ok: true, roomId: room.id, playerId: player.id });

    // Auto-start once two players are present.
    if (room.players.length === 2 && !room.state) {
      room.state = game.createGame(room.players);
    }
    broadcastLobby(room);
    broadcastState(room);
  });

  socket.on("play", ({ source, centerIndex }) => {
    const room = getRoom(currentRoomId);
    if (!room || !room.state) return;
    const res = game.playToCenter(room.state, currentPlayerId, source, centerIndex);
    if (!res.ok) socket.emit("actionError", res.error);
    broadcastState(room);
  });

  socket.on("discard", ({ handIndex, discardIndex }) => {
    const room = getRoom(currentRoomId);
    if (!room || !room.state) return;
    const res = game.discard(room.state, currentPlayerId, handIndex, discardIndex);
    if (!res.ok) socket.emit("actionError", res.error);
    broadcastState(room);
  });

  socket.on("rematch", () => {
    const room = getRoom(currentRoomId);
    if (!room || room.players.length < 2) return;
    room.state = game.createGame(room.players);
    broadcastLobby(room);
    broadcastState(room);
  });

  socket.on("disconnect", () => {
    const room = getRoom(currentRoomId);
    if (!room) return;
    const player = room.players.find((p) => p.id === currentPlayerId);
    if (player) player.socketId = null;

    // Clean up empty rooms that never started.
    const anyConnected = room.players.some((p) => p.socketId);
    if (!anyConnected && !room.state) rooms.delete(room.id);

    broadcastLobby(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[v0] Spite & Malice server running on port ${PORT}`);
});
