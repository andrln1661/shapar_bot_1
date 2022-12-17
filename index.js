import TeleBot from "telebot";
import { config } from "dotenv";
config();
const bot = new TeleBot({ token: process.env.BOT_TOKEN, polling: true });

const users = {};
const adminId = parseInt(process.env.ADMIN_ID);
const bundles = [];
const channels = {};

//Test commands
bot.on("/bundles", (msg) => {
  if (!msg.from) return;
  if (bundles.length) bot.sendMessage(msg.chat.id, bundles.join("\r\n"));
});
bot.on("/channels", (msg) => {
  if (!msg.from) return;
  bot.sendMessage(msg.chat.id, JSON.stringify(channels));
});

//Vars to verify if admin gonna add smth
let adminStatus = false;
let adminEvent = "none";

//Function to check if user subscribed the channels
async function checkUser(userId) {
  let result = true;
  for (let channel of Object.keys(channels)) {
    let status = await bot
      .getChatMember(channels[channel].id, userId)
      .then((res) => res.status)
      .catch((error) => console.error(error));
    if (status == "left") {
      delete users[userId];
      result = false;
    }
  }
  return result;
}

//Send bundle to users
async function mainling() {
  console.log("users: ", users);
  Object.keys(users).map(async (user) => {
    let userStatus = await checkUser(users[user]);
    if (userStatus) {
      if (bundles.length) {
        bot.sendMessage(
          users[user].id,
          bundles[Math.floor(Math.random() * bundles.length)]
        );
      } else {
        bot.sendMessage(
          users[user].id,
          "Sorry for now there is no active bundle"
        );
      }
    } else {
      let keyboard = [[{ text: "Check Again", callback_data: "check" }]];
      for (let channel of Object.keys(channels)) {
        keyboard.unshift([
          { text: channels[channel].title, url: channels[channel].link },
        ]);
        bot.sendMessage(msg.chat.id, "You are not a member", {
          replyMarkup: { inline_keyboard: keyboard },
        });
      }
    }
  });
}
setInterval(mainling, 1000 * 10);

//Basic commands the same functionality should verify user's subscriptions, send the first bundle and pass user to waiting list
bot.on(["/start", "/check"], async (msg) => {
  if (!msg.from) return;
  let keyboard = [[{ text: "Check Again", callback_data: "check" }]];
  for (let channel of Object.keys(channels)) {
    keyboard.unshift([
      { text: channels[channel].title, url: channels[channel].link },
    ]);
  }
  let userStatus = await checkUser(msg.chat.id);
  if (userStatus) {
    bot.sendMessage(
      msg.chat.id,
      "You are a member. Thanks for subscription. Your bundle will be sent automaticly"
    );
    if (!users[msg.chat.id]) {
      users[msg.chat.id] = { id: msg.chat.id };
      bot.sendMessage(msg.chat.id, "Нихуя себе связка ща милионером станешь");
    }
  } else {
    bot.sendMessage(msg.chat.id, "You are not a member", {
      replyMarkup: { inline_keyboard: keyboard },
    });
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
  bot.sendMessage(
    msg.chat.id,
    `
    You can type or select using buttons following commands

/start (/check) - check your followers and get your bundle
/help - if you need some help

if you need more detailed explanation or smth else contact @admin
    `,
    {
      replyMarkup: {
        inline_keyboard: keyboard,
      },
    }
  );
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
      if (!adminStatus) break;
      adminEvent = "add_channel";
      bot.sendMessage(msg.chat.id, "Now enter the channel id");
      break;
    case "admin_delete_channel":
      if (!adminStatus) break;
      bot.sendMessage(
        msg.chat.id,
        `Enter the channel id \r\n The following are aviable ${Object.keys(
          channels
        ).join("; ")}`
      );
      adminEvent = "delete_channel";
      break;
    case "delete_bundle":
      console.log(msg);
      bot.sendMessage(msg.chat.id, "Bundle deleted");
      break;
    default:
      break;
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

//Commant to auth admin
bot.on("/channel", (msg) => {
  if (!msg.from) return;
  if (msg.chat.id == adminId) {
    let keyboard = [
      [
        { text: "Add channel", callback_data: "admin_add_channel" },
        { text: "Delete channel", callback_data: "admin_delete_channel" },
      ],
    ];
    adminStatus = true;
    bot.sendMessage(msg.chat.id, "Select option from the following menu", {
      replyMarkup: { inline_keyboard: keyboard },
    });
  }
});

bot.on("/mail", (msg) => {
  if (msg.from && msg.chat.id == adminId) {
    mainling();
  }
});

// Handler for admin events and adding bundles from bundle channel any other text message will be skipped
bot.on("text", async (msg) => {
  if (msg.from && msg.chat.id == adminId && adminStatus) {
    switch (adminEvent) {
      case "add_channel":
        if (!parseInt(msg.text)) break;
        if (!channels[msg.text]) {
          await bot
            .getChat(parseInt(msg.text))
            .then((res) => {
              console.log(res);
              channels[msg.text] = {
                id: parseInt(msg.text),
                link: res.invite_link,
                title: res.title,
              };
            })
            .catch((error) => console.log(error));
          console.log(channels);
          bot.sendMessage(
            msg.chat.id,
            `channel ${channels[msg.text].link}  ${msg.text} successful added`
          );
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
          bot.sendMessage(`Channel ${msg.text} successful deleted`);
        } else {
          bot.sendMessage(msg.chat.id, "There is no channel with this id");
        }
        break;
      default:
        break;
    }
    adminStatus = false;
    adminEvent = "none";
  }
  if (msg.chat.id == process.env.BUNDLE_CHANNEL_ID) {
    let keyboard = [[{ text: "DELETE", callback_data: "delete_bundle" }]];
    bundles.push(msg.text);
    bot.sendMessage(msg.chat.id, "Bundle was added to a waiting list", {
      replyMarkup: { inline_keyboard: keyboard },
    });
  }
});

bot.start();
