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

let sendBundlesAuto = process.env.SEND_BUNDLES_AUTO;
let clearBundlesTime = process.env.CLEAR_BUNDLES_TIME;

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
  console.log("Неактуальные связки удалены");
  if (Object.keys(bundles).length >= 0) {
    Object.keys(bundles).map((bundle) => {
      let now = new Date();
      if (now - bundles[bundle].created > 1000 * 60 * 30) {
        bot.deleteMessage(-1001721564781, bundles[bundle].message_id);
        bot.deleteMessage(-1001721564781, bundles[bundle].message_id + 1);
        delete bundles[bundle];
      }
    });
  }
  if (Object.keys(bundles).length <= 0) {
    console.log("В скрабере закончились связки");
    bot.sendMessage(adminId, "В скрабере закончились связки", {
      notification: true,
    });
  }
}
setInterval(clearBundles, parseInt(clearBundlesTime) * 60 * 1000 - 1000);

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
  console.log(`Проверка подписки пользователя ${userId}`);
  return result;
}

// send message to user that he is not subscribed
function notSubscribed(userId) {
  console.log(`Пользователь ${userId} не подписан. Отправка сообщения`);
  let keyboard = [[{ text: "Check Again", callback_data: "check" }]];
  for (let channel of Object.keys(channels)) {
    keyboard.unshift([
      { text: channels[channel].title, url: channels[channel].link },
    ]);
  }
  bot.sendMessage(
    userId,
    "Вы не подписаны на соответствующие каналы. Ссылки представлены снизу. После того как подпишитесь нажмите проверить снова или введите команду /check (/start)",
    {
      replyMarkup: { inline_keyboard: keyboard },
    }
  );
}

function justSendBundle(userId, qtyOfBundles) {
  if (Object.keys(bundles).length) {
    for (let i = 0; i < qtyOfBundles; i++) {
      let bundle =
        bundles[
          Object.keys(bundles)[
            Math.floor(Math.random() * Object.keys(bundles).length)
          ]
        ];
      forwardMessage(userId, bundle.chat_id, bundle.message_id);
    }
  } else {
    bot.sendMessage(userId, no_active_budle);
  }
}

// Send bundle handler
function sendBundles(userStatus, userId) {
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
      console.warn("В скрабере закончились связки");
      bot.sendMessage(users[userId].id, no_active_budle);
    }
  } else {
    console.log(`User ${userId} is not subscribed`);
    notSubscribed(users[userId].id);
  }
}

//Send bundle to users
async function mailing() {
  console.log("Админ вызвал принудительную рассылку связок");
  Object.keys(users).map(async (user) => {
    let userStatus = await checkUser(users[user].id);
    sendBundles(userStatus, user);
  });
}

//Auto send bundle for user as 12 hours passed
async function autoMailing() {
  console.log("Автоматическая (по рассписанию) рассылка связок");
  Object.keys(users).map(async (user) => {
    let now = new Date();
    let date = new Date(users[user].bundle_sent);
    if (date - now + sendBundlesAuto * 1000 * 60 * 60 < 1000 * 60 * 60) {
      let userStatus = await checkUser(users[user].id);
      let callback = () => sendBundles(userStatus, user);
      setTimeout(callback, date - now + sendBundlesAuto * 1000 * 60 * 60);
    }
  });
}
setInterval(autoMailing, 1000 * 60 * 60);

//Basic commands the same functionality should verify user's subscriptions, send the first bundle and pass user to waiting list
bot.on(["/start", "/check"], async (msg) => {
  if (!msg.from) return;
  let userStatus = await checkUser(msg.chat.id);
  if (userStatus) {
    if (!users[msg.chat.id]) {
      users[msg.chat.id] = {
        id: msg.chat.id,
        bundle_sent: new Date(),
        started: true,
      };
      fs.writeFile("./users.json", JSON.stringify(users), (err, data) => {
        if (err) {
          console.error(err);
        } else {
          console.log("Новый пользователь сохранен в users.json");
        }
      });
      justSendBundle(msg.chat.id, 2);
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
        bot.sendMessage(
          msg.chat.id,
          "Введите id канала в формате -100**********"
        );
      }
      break;
    case "admin_delete_channel":
      if (msg.chat.id == adminId) {
        bot.sendMessage(
          msg.chat.id,
          `Удаление канала. Введите id канала из списка \r\n ${Object.keys(
            channels
          ).join("\r\n")}`
        );
        adminEvent = "delete_channel";
      }
      break;
    case "delete_bundle":
      console.log(`Принудительное удаление связки ${msg.message_id - 1}`);
      if (bundles[msg.message_id - 1]) delete bundles[msg.message_id - 1];
      bot.deleteMessage(
        parseInt(process.env.BUNDLE_CHANNEL_ID),
        msg.message_id - 1
      );
      bot.deleteMessage(
        parseInt(process.env.BUNDLE_CHANNEL_ID),
        msg.message_id
      );
      break;
    case "admin_bundles":
      if (msg.chat.id == adminId) {
        console.log(bundles);
        bot.sendMessage(msg.chat.id, JSON.stringify(bundles, null, 2));
      }
      break;
    case "admin_clear_bundles":
      clearBundles();
      console.log("Принудительное удаление связок");
      bot.sendMessage(msg.chat.id, "All bundles deleted");
      break;
    case "admin_channels":
      if (msg.chat.id == adminId) {
        console.log(channels);
        bot.sendMessage(msg.chat.id, JSON.stringify(channels, null, 2));
      }
      break;
    case "admin_users":
      if (msg.chat.id == adminId) {
        console.log(users);
        if (Object.keys(users).length) {
          bot.sendMessage(msg.chat.id, Object.keys(users).join("/r/n"));
        } else {
          bot.sendMessage(msg.chat.id, "нет пользователей");
        }
      }
      break;
    case "admin_mail_bundles":
      if (msg.chat.id == adminId) {
        mailing();
        bot.sendMessage(msg.chat.id, "Связки отправлены");
      }
      break;

    default:
      break;
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

//Command to auth admin
bot.on("/admin", (msg) => {
  if (!msg.from) return;
  if (msg.chat.id == adminId) {
    let keyboard = [
      [
        { text: "Добавить канал", callback_data: "admin_add_channel" },
        { text: "Удалить канал", callback_data: "admin_delete_channel" },
      ],
      [
        { text: "Показать каналы", callback_data: "admin_channels" },
        { text: "Показать пользователей", callback_data: "admin_users" },
      ],
      [
        { text: "Отправить связки", callback_data: "admin_mail_bundles" },
        { text: "Показать связки", callback_data: "admin_bundles" },
      ],
      [{ text: "Удалить все связки", callback_data: "admin_clear_bundles" }],
    ];
    bot.sendMessage(
      msg.chat.id,
      "Меню админа. \r\n выберите действие из представленных ниже",
      {
        replyMarkup: { inline_keyboard: keyboard },
      }
    );
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
            "Id телеграм канала должен быть в форме -100**********"
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
            console.log(`Канал ${msg.text} успешно добавлен`);
            bot.sendMessage(
              msg.chat.id,
              `Канал ${channels[msg.text].link}  ${msg.text} успешно добавлен`
            );
          } catch (error) {
            console.log(error);
            bot.sendMessage(
              msg.chat.id,
              "Произошла ошибка при добавлении канала. Проверьте в консоли. Убедитесь что id предоставлен в форме -100**********"
            );
          }
        } else {
          bot.sendMessage(
            msg.chat.id,
            `Канал ${msg.text} уже имеется в спискe`
          );
        }
        break;
      case "delete_channel":
        if (!parseInt(msg.text)) {
          bot.sendMessage(
            msg.chat.id,
            "Неверный формат. id должен быть в виде -100***********"
          );
          break;
        }
        if (channels[msg.text]) {
          delete channels[msg.text];
          fs.writeFile(
            "./channels.json",
            JSON.stringify(channels),
            (err, data) => {
              if (err) console.error(err);
            }
          );
          console.log(`Канал ${msg.text} успешно удален`);
          bot.sendMessage(msg.chat.id, `Канал ${msg.text} успешно удален`);
        } else {
          bot.sendMessage(
            msg.chat.id,
            "Канал с предоставленным id не содержится в списке"
          );
        }
        break;
      default:
        break;
    }
    adminEvent = "none";
  }
  if (msg.chat.id == process.env.BUNDLE_CHANNEL_ID) {
    let keyboard = [[{ text: "Удалить", callback_data: "delete_bundle" }]];
    bundles[msg.message_id] = {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      created: new Date(),
    };
    console.log(`Связкa ${msg.message_id} добавлена`);
    bot.sendMessage(msg.chat.id, `Связка id: ${msg.message_id} добавлена`, {
      replyMarkup: { inline_keyboard: keyboard },
    });
  }
});

bot.start();
