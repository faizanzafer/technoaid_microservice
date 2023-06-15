const http = require("http");
const express = require("express");
const { ExpressPeerServer } = require("peer");
const socketio = require("socket.io");
const cors = require("cors");
const axios = require("axios").default;

const router = require("./router");
const {
  addUser,
  removeUser,
  getUser,
  getUsersInRoom,
  getUserFromToken,
} = require("./users");

const sendNotification = require("./firebase_notifications");

// const BASE_URL = " http://127.0.0.1:8000/api";
const BASE_URL = "http://technoaid.onewoodsolutions.com/api";

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.use(cors());
app.use(router);

const peerServer = ExpressPeerServer(server, {
  // debug: true,
  path: "/",
});

peerServer.on("connection", (client) => {
  console.log(`${client.id} - connected to peer server`);
});

peerServer.on("disconnect", (client) => {
  console.log(`${client.id} - disconnected from peer server`);
});

app.use("/peerjs", peerServer);

io.on("connect", (socket) => {
  console.log("new socket connected", socket.id);
  socket.on("join", ({ token }, callback) => {
    try {
      const { error, user } = addUser({ token, socketId: socket.id });

      if (error) return callback(getError(error));

      callback(getSuccess("User Connected to Socket Successfully"));
    } catch (err) {
      console.log(err);
    }
  });

  socket.on("sendMessage", ({ token, message }, callback) => {
    try {
      if (
        !token ||
        !message ||
        !message.to_id ||
        typeof message.to_id !== "number" ||
        !message.messageType
      )
        return callback(
          getError(
            "Parameters are not valid. token should be a token:JWT variable and message should be an object containing to_id:integer messageType:text|media variable."
          )
        );

      const { error, userData } = getUserFromToken(token);
      if (error) {
        return callback(getError(error));
      }
      const userPrimary = getUser(userData.id);
      if (!userPrimary) {
        return callback(
          getError("un registered user in sockets cannot send message")
        );
      }

      const to_id = message.to_id;
      const messageType = message.messageType;
      let messageBody = null;
      let attachments = null;
      let mediaType = null;

      if (messageType == "text") {
        if (!message.messageBody)
          return callback(
            getError("if messageType is text then messageBody is required.")
          );
        messageBody = message.messageBody;
      } else if (messageType == "media") {
        if (
          !message.attachments ||
          // !Array.isArray(message.attachments) ||
          // message.attachments.length == 0 ||
          !message.mediaType
        )
          return callback(
            getError(
              "if messageType is media then attachments and mediaType is required."
            )
          );
        attachments = message.attachments;
        mediaType = message.mediaType;

        if (message.messageBody) messageBody = message.messageBody;
      } else
        return callback(
          getError("messageType is not valid. it should only be text or media.")
        );

      const user = getUser(message.to_id);

      const messageObject = {
        to_id,
        messageType,
        messageBody,
        attachment: attachments,
        mediaType,
      };

      axios
        .post(`${BASE_URL}/send`, messageObject, {
          headers: {
            authorization: `Bearer ${token}`,
          },
        })
        .then((response) => {
          const data_recieved = response.data.data;
          const { device_id, sender_name } = response.data;
          const responseData = {
            message_id: parseInt(data_recieved.id),
            toId: parseInt(data_recieved.to_id),
            fromId: parseInt(data_recieved.from_id),
            messageBody: data_recieved.messageBody,
            messageType: data_recieved.messageType,
            attachments: data_recieved.attachments,
            lastMessageTime: data_recieved.messageTime,
          };
          console.log(response.data, responseData);

          if (user) {
            io.to(user.socketId).emit("recieveMessage", responseData);
          } else {
            if (device_id) {
              if (messageType == "media") {
                const notification = {
                  title: sender_name,
                  body: "Attachment",
                };
                sendNotification(device_id, notification);
              } else {
                const notification = {
                  title: sender_name,
                  body: responseData.messageBody,
                };
                sendNotification(device_id, notification);
              }
            }
            return callback(responseData);
          }
        })
        .catch((errr) => {
          console.log(errr.response.data);
          return callback(
            getError(
              errr
                ? errr.response
                  ? errr.response.data
                  : "undefined error"
                : "undefined error"
            )
          );
        });
    } catch (err) {
      console.log(err);
    }
  });

  socket.on("typing", (data, callback) => {
    try {
      if (
        !data ||
        !data.to_id ||
        typeof data.to_id !== "number" ||
        data.to_id <= 0 ||
        typeof data.isTyping === "undefined" ||
        typeof data.isTyping === null ||
        typeof data.isTyping !== "boolean"
      ) {
        return callback(
          getError(
            "Data is not valid. Data should be an object containing to_id:integer and isTyping:boolean variable."
          )
        );
      }
      const to_id = data.to_id;
      const isTyping = data.isTyping;

      const user = getUser(to_id);

      if (user) {
        io.to(user.socketId).emit("typing", { isTyping });
      } else {
        return callback();
      }
      callback();
    } catch (error) {}
  });

  socket.on("makeCall", ({ token, to_id, call_type }, callback) => {
    try {
      if (!token)
        return callback(
          getError(
            "Parameters are not valid. token should be a token:JWT variable ."
          )
        );

      const { error, userData } = getUserFromToken(token);
      if (error) {
        return callback(getError(error));
      }

      const user = getUser(userData.id);
      if (!user) {
        return callback(
          getError("un registered user in sockets cannot send message")
        );
      }

      if (!to_id || typeof to_id != "number") {
        return callback(
          getError("to_id is required. And it should be an integer")
        );
      }
      if (!call_type) {
        return callback(getError("call_type is required"));
      }
      if (call_type != "audio") {
        if (call_type != "video") {
          return callback(getError("call_type can only be audio or video"));
        }
      }

      const secondaryUser = getUser(to_id);

      if (!secondaryUser) {
        return callback(getError("Secondary User is offline"));
      }

      axios
        .post(
          `${BASE_URL}/get_twilio_token`,
          { secondary_user_id: to_id },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          }
        )
        .then((response) => {
          console.log("twilio token", response.data);
          const { twilioToken, me } = response.data;
          socket
            .to(secondaryUser.socketId)
            .emit("receiveCall", { me, call_type });
          callback(getSuccess({ twilioToken, call_type }));
        })
        .catch((err) => {
          console.log(
            "error block in axios get_twilio_token api",
            err.response.data
          );
          callback(getError(err.response.data));
        });
    } catch (error) {
      console.log("error block makeCall emit");
      console.log(getError(error));
      return;
    }
  });

  socket.on("callResponse", ({ token, to_id, response }, callback) => {
    try {
      if (!token)
        return callback(
          getError(
            "Parameters are not valid. token should be a token:JWT variable."
          )
        );

      const { error, userData } = getUserFromToken(token);
      if (error) {
        return callback(getError(error));
      }

      const user = getUser(userData.id);
      if (!user) {
        return callback(
          getError("un registered user in sockets cannot send message")
        );
      }

      if (!to_id || typeof to_id != "number") {
        return callback(
          getError("to_id is required. And it should be an integer")
        );
      }
      if (!response || typeof response != "number") {
        return callback(
          getError("response is required. And it should be an integer")
        );
      }
      if (response != 1) {
        if (response != 2) {
          return callback(
            getError("response value can only be 1(accept) or 2(decline)")
          );
        }
      }

      const secondaryUser = getUser(to_id);
      if (!secondaryUser) {
        return callback(getError("Secondary User left the call-room"));
      }

      if (response == 1) {
        axios
          .post(
            `${BASE_URL}/get_twilio_token`,
            { secondary_user_id: to_id },
            {
              headers: {
                authorization: `Bearer ${token}`,
              },
            }
          )
          .then((res) => {
            console.log("twilio token callResponse", res.data);
            const { twilioToken, me } = res.data;
            socket
              .to(secondaryUser.socketId)
              .emit("callResponse", { response });
            callback(getSuccess(twilioToken));
          })
          .catch((err) => {
            console.log(
              "error block in axios get_twilio_token api of callResponse",
              err.response.data
            );
            callback(getError(err.response.data));
          });
      } else {
        axios
          .post(
            `${BASE_URL}/delete_twilio_token`,
            { secondary_user_id: to_id },
            {
              headers: {
                authorization: `Bearer ${token}`,
              },
            }
          )
          .then((res) => {
            console.log("twilio token callResponse", res.data);
            socket
              .to(secondaryUser.socketId)
              .emit("callResponse", { response });
            callback({ response });
          })
          .catch((err) => {
            console.log(
              "error block in axios get_twilio_token api of callResponse",
              err.response.data
            );
            callback(getError(err.response.data));
          });
      }
    } catch (error) {
      console.log("error block callResponse emit");
      console.log(getError(error));
      return;
    }
  });

  socket.on("disconnect", () => {
    const user = removeUser(socket.id);
    console.log(" socket disconnected", socket.id, user);
    try {
      if (user) {
        const { id, token } = user;
        axios
          .get(`${BASE_URL}/delete_call_room_by_my_id`, {
            headers: {
              authorization: `Bearer ${token}`,
            },
          })
          .then((response) => {
            console.log("disconnecting_user_room_data", response.data);
            const {
              primary_user_id,
              secondary_user_id,
              room_id: room_name,
            } = response.data.data;
            const socket_response_data = {
              primary_user_id,
              secondary_user_id,
              room_name,
            };
            let sencondary_user = null;
            if (primary_user_id == id) sencondary_user = secondary_user_id;
            else sencondary_user = primary_user_id;

            console.log("sencondary_user", sencondary_user);

            const socket_secondary_user = getUser(sencondary_user);
            console.log("socket_secondary_user", socket_secondary_user);
            if (socket_secondary_user) {
              console.log("socket_response_data", socket_response_data);
              socket
                .to(socket_secondary_user.socketId)
                .emit("call_end", socket_response_data);
            }
          })
          .catch((err) => {
            console.log("error block in axios delete room", err.response.data);
          });
      }
    } catch (error) {
      console.log("error block disconnect socket");
    }
  });
});

server.listen(process.env.PORT || 5001, () =>
  console.log(`Server has started on port ${process.env.PORT || 5001}`)
);

const getError = (errorString) => {
  return {
    error: errorString,
  };
};

const getSuccess = (successString) => {
  return {
    data: successString,
  };
};
