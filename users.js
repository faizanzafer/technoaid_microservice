const jwt_decode = require("jwt-decode");

const users = [];

const addUser = ({ token, socketId }) => {
  if (!token) return { error: "Token is required." };

  try {
    const { error: err, userData } = getUserFromToken(token);
    if (err) {
      return { error: err };
    }
    const id = userData.id;
    const existingUser = users.find((user) => user.id == id);

    if (existingUser) return { error: "This User is already Connected." };

    const user = { id, socketId, token };

    users.push(user);

    return { user };
  } catch (err) {
    return { error: err };
  }
};

const removeUser = (socketId) => {
  const index = users.findIndex((user) => user.socketId === socketId);

  if (index !== -1) return users.splice(index, 1)[0];
};

const getUserFromToken = (token) => {
  if (!token) return { error: "Token is required." };

  try {
    const data = jwt_decode(token);
    if (!data) return { error: "Invalid Token." };

    const userData = data.user;
    if (!userData) return { error: "Invalid token." };
    const id = userData.id;

    if (!id) return { error: "invalid token." };

    const datetime = Math.round(Date.now() / 1000);

    if (datetime >= data.exp) return { error: "token expired." };
    console.log(id);
    return { userData };
  } catch (err) {
    return { error: err.message };
  }
};

const getUser = (id) => users.find((user) => user.id === id);

const getUsersInRoom = (room = "") => users;

module.exports = {
  addUser,
  removeUser,
  getUser,
  getUsersInRoom,
  getUserFromToken,
};
