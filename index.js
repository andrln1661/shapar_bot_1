import TeleBot from "telebot";
import fs from "fs";
import { config } from "dotenv";
import axios from "axios";
import {
  help_message,
  no_active_budle,
  subscription_positive,
} from "./messages.js";
config();
const bot = new TeleBot({
  token: process.env.BOT_TOKEN,
  polling: true,
});

let users = {};
fs.readFile("./users.json", (err, data) => {
  if (err) {
    console.error(err);
  } else {
    console.log("users", JSON.parse(data));
    users = JSON.parse(data);
  }
});
let channels = {};
fs.readFile("./channels.json", (err, data) => {
  if (err) {
    console.error(err);
  } else {
    console.log("channels", JSON.parse(data));
    channels = JSON.parse(data);
  }
});
const adminId = parseInt(process.env.ADMIN_ID);
const bundles = {};

const sendBundlesAuto = process.env.SEND_BUNDLES_AUTO * 12;
const checkUsersHours = process.env.CHECK_USERS_HOURS * 1000 * 60 * 60 * 12;

//Vars to verify if admin gonna do smth
let adminEvent = "none";

function forwardMessage(userId, bundleChatId, bundleId) {
  const options = {
    method: "POST",
    url: `https://api.telegram.org/bot${process.env.BOT_TOKEN}/forwardMessage`,
    headers: {
      accept: "application/json",
      "User-Agent":
        "Telegram Bot SDK - (https://github.com/irazasyed/telegram-bot-sdk)",
      "content-type": "application/json",
    },
    data: {
      message_id: bundleId,
      disable_notification: false,
      chat_id: userId,
      from_chat_id: bundleChatId,
      protect_content: true,
    },
  };
  let result;
  axios
    .request(options)
    .then((res) => {
      result = res;
    })
    .catch((err) => console.error(err));
  return result;
}

function clearBundles() {
  if (Object.keys(bundles).length) {
    Object.keys(bundles).map((bundle) => {
      let now = new Date();
      if (now - bundles[bundle].created > 1000 * 60 * 30) {
        delete bundles[bundle];
        bot.deleteMessage(-1001721564781, bundles[bundle].message_id);
        bot.deleteMessage(-1001721564781, bundles[bundle].message_id + 1);
      }
    });
  }
  console.log("Irrelevant bundles has been cleared");
}
setInterval(clearBundles, 5 * 60 * 1000 - 1000);

//Function to check if user subscribed the channels
async function checkUser(userId) {
  let result = true;
  for (let channel of Object.keys(channels)) {
    let status = await bot
      .getChatMember(channels[channel].id, userId)
      .then((res) => res.status)
      .catch((error) => console.error(error));
    if (status == "left") {
      result = false;
    }
  }
  console.log(`Checking if user ${userId} subscribed to the required channels`);
  return result;
}

// send message to user that he is not subscribed
function notSubscribed(userId) {
  console.log(`Sending message to user ${userId} that he is not subscribed`);
  let keyboard = [[{ text: "Check Again", callback_data: "check" }]];
  for (let channel of Object.keys(channels)) {
    keyboard.unshift([
      { text: channels[channel].title, url: channels[channel].link },
    ]);
  }
  bot.sendMessage(userId, "You are not a member", {
    replyMarkup: { inline_keyboard: keyboard },
  });
}

// Send bundle handler
function sendBundles(userStatus, userId) {
  console.log("Sending bundles to users");
  if (userStatus) {
    if (Object.keys(bundles).length) {
      let bundle =
        bundles[
          Object.keys(bundles)[
            Math.floor(Math.random() * Object.keys(bundles).length)
          ]
        ];
      console.log(userId, bundle);
      forwardMessage(userId, bundle.chat_id, bundle.message_id);
      users[userId].bundle_sent = new Date();
      fs.writeFile("./users.json", JSON.stringify(users), (err, data) => {
        if (err) console.error(err);
      });
    } else {
      console.warn("No one relevant bundle in scrabber");
      bot.sendMessage(users[userId].id, no_active_budle, {
        protect_content: true,
      });
    }
  } else {
    console.log(`User ${userId} is not subscribed`);
    notSubscribed(users[userId].id);
  }
}

//Send bundle to users
async function mailing() {
  console.log("Forced mailing calling by admin");
  Object.keys(users).map(async (user) => {
    let userStatus = await checkUser(users[user].id);
    sendBundles(userStatus, user);
  });
}

//Auto send bundle for user as 12 hours passed
async function autoMailing() {
  console.log("Automatic mailing");
  Object.keys(users).map(async (user) => {
    let now = new Date();
    let date = new Date(users[user].bundle_sent);
    if (now.getHours() - date.getHours() > sendBundlesAuto) {
      let userStatus = await checkUser(users[user].id);
      let callback = () => sendBundles(userStatus, user);
      setTimeout(callback, date - now + sendBundlesAuto * 1000 * 60 * 60);
    }
  });
}
console.log(checkUsersHours);
setInterval(autoMailing, checkUsersHours);

//Basic commands the same functionality should verify user's subscriptions, send the first bundle and pass user to waiting list
bot.on(["/start", "/check"], async (msg) => {
  if (!msg.from) return;
  let userStatus = await checkUser(msg.chat.id);
  if (userStatus) {
    if (!users[msg.chat.id]) {
      users[msg.chat.id] = { id: msg.chat.id, bundle_sent: new Date() };
      fs.writeFile("./users.json", JSON.stringify(users), (err, data) => {
        if (err) {
          console.error(err);
        } else {
          console.log("new user saved to users.json");
        }
      });
      sendBundles(true, msg.chat.id);
    }
    bot.sendMessage(msg.chat.id, subscription_positive);
  } else {
    notSubscribed(msg.chat.id);
  }
});

//Command to recieve help
bot.on("/help", (msg) => {
  if (!msg.from) return;
  let keyboard = [
    [
      {
        text: "start",
        callback_data: "start",
      },
      { text: "check", callback_data: "check" },
    ],
    [
      {
        text: "help",
        callback_data: "help",
      },
    ],
  ];
  bot.sendMessage(msg.chat.id, help_message, {
    replyMarkup: {
      inline_keyboard: keyboard,
    },
  });
});

//Query handler (buttons)
bot.on("callbackQuery", (callbackQuery) => {
  const action = callbackQuery.data;
  const msg = callbackQuery.message;

  switch (action) {
    case "start":
      bot.event("/start", {
        chat: { id: msg.chat.id },
        from: { id: msg.chat.id },
      });
      break;
    case "help":
      bot.event("/help", {
        chat: { id: msg.chat.id },
        from: { id: msg.chat.id },
      });
      break;
    case "check":
      bot.event("/check", {
        chat: { id: msg.chat.id },
        from: { id: msg.chat.id },
      });
      break;
    case "admin_add_channel":
      if (msg.chat.id == adminId) {
        adminEvent = "add_channel";
        bot.sendMessage(msg.chat.id, "Now enter the channel id");
      }
      break;
    case "admin_delete_channel":
      if (msg.chat.id == adminId) {
        bot.sendMessage(
          msg.chat.id,
          `Enter the channel id \r\n The following are aviable ${Object.keys(
            channels
          ).join("; ")}`
        );
        adminEvent = "delete_channel";
      }
      break;
    case "delete_bundle":
      console.log(`Forced delete bundle ${msg.message_id - 1}`);
      if (bundles[msg.message_id - 1]) delete bundles[msg.message_id - 1];
      bot.deleteMessage(-1001721564781, msg.message_id - 1);
      bot.deleteMessage(-1001721564781, msg.message_id);
      break;
    case "admin_bundles":
      if (msg.chat.id == adminId) {
        console.log(bundles);
        bot.sendMessage(msg.chat.id, JSON.stringify(bundles));
      }
      break;
    case "admin_channels":
      if (msg.chat.id == adminId) {
        console.log(channels);
        bot.sendMessage(msg.chat.id, JSON.stringify(channels));
      }
      break;
    case "admin_users":
      if (msg.chat.id == adminId) {
        console.log(users);
        if (Object.keys(users).length) {
          bot.sendMessage(msg.chat.id, Object.keys(users).join("/r/n"));
        } else {
          bot.sendMessage(msg.chat.id, "no users");
        }
      }
      break;
    case "admin_mail_bundles":
      if (msg.chat.id == adminId) {
        mailing();
        bot.sendMessage(msg.chat.id, "Bundles sent");
      }
      break;
    default:
      break;
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

//Comman to auth admin
bot.on("/admin", (msg) => {
  if (!msg.from) return;
  if (msg.chat.id == adminId) {
    let keyboard = [
      [
        { text: "Add channel", callback_data: "admin_add_channel" },
        { text: "Delete channel", callback_data: "admin_delete_channel" },
      ],
      [
        { text: "Channels", callback_data: "admin_channels" },
        { text: "Users", callback_data: "admin_users" },
      ],
      [
        { text: "Send Bundles", callback_data: "admin_mail_bundles" },
        { text: "Bundles", callback_data: "admin_bundles" },
      ],
    ];
    bot.sendMessage(msg.chat.id, "Select option from the following menu", {
      replyMarkup: { inline_keyboard: keyboard },
    });
  }
});

// Handler for admin events and adding bundles from bundle channel any other text message will be skipped
bot.on("text", async (msg) => {
  if (msg.from && msg.chat.id == adminId) {
    switch (adminEvent) {
      case "add_channel":
        if (!parseInt(msg.text)) {
          bot.sendMessage(
            msg.chat.id,
            "telegram channel id will be in form of -100**********"
          );
          break;
        }
        if (!channels[msg.text]) {
          try {
            await bot
              .getChat(parseInt(msg.text))
              .then((res) => {
                channels[msg.text] = {
                  id: parseInt(msg.text),
                  link: res.invite_link,
                  title: res.title,
                };
              })
              .catch((error) => console.error(error));
            fs.writeFile(
              "./channels.json",
              JSON.stringify(channels),
              (err, data) => {
                if (err) console.error(err);
              }
            );
            console.log(`Channel ${msg.text} successful added`);
            bot.sendMessage(
              msg.chat.id,
              `channel ${channels[msg.text].link}  ${msg.text} successful added`
            );
          } catch (error) {
            console.log(error);
            bot.sendMessage(
              msg.chat.id,
              "Some error occured check if bot is admin of the channel you are going to add and check if its id is in correct form of -100**********"
            );
          }
        } else {
          bot.sendMessage(
            msg.chat.id,
            `Channel id:${msg.text} has already been declared`
          );
        }
        break;
      case "delete_channel":
        if (!parseInt(msg.text)) break;
        if (channels[msg.text]) {
          delete channels[msg.text];
          fs.writeFile(
            "./channels.json",
            JSON.stringify(channels),
            (err, data) => {
              if (err) console.error(err);
            }
          );
          console.log(`Channel ${msg.text} successfull deleted`);
          bot.sendMessage(
            msg.chat.id,
            `Channel ${msg.text} successful deleted`
          );
        } else {
          bot.sendMessage(msg.chat.id, "There is no channel with this id");
        }
        break;
      default:
        break;
    }
    adminEvent = "none";
  }
  if (msg.chat.id == process.env.BUNDLE_CHANNEL_ID) {
    let keyboard = [[{ text: "DELETE", callback_data: "delete_bundle" }]];
    bundles[msg.message_id] = {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      created: new Date(),
    };
    bot.sendMessage(
      msg.chat.id,
      `Bundle id: ${msg.message_id} was added to a waiting list`,
      {
        replyMarkup: { inline_keyboard: keyboard },
      }
    );
  }
});

bot.start();
