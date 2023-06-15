const admin = require("firebase-admin");
const serviceAccount = require("./technoaid-37221-firebase-adminsdk-8h5m0-5de5f6dbaa.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const YOUR_REGISTRATION_TOKEN = "REGISTRATION_TOKEN_HERE";

const sendNotification = (device_id, notification) => {
  var registrationToken = device_id;

  var message = {
    notification,
    token: registrationToken,
  };

  admin
    .messaging()
    .send(message)
    .then((response) => {
      console.log("Successfully sent message:", response);
    })
    .catch((error) => {
      console.log("Error sending message:", error);
    });
};

module.exports = sendNotification;
