import express from 'express';
import type { Request, Response } from 'express';
import mysql from 'mysql2/promise'

const db= mysql.createPool({
host:'localhost',
user:'root',
password:'',
database:'chatdb'

});
const app=express();
app.use(express.json());
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
//1 && 2 Create or get chat and send the message
/*
eg
Method post
Req url  localhost:3000/chat/create
Req body
{
  "chat_message":"text message",
  "sender_user_id":"userBId",
  "receiver_user_id":"userAId"
}

Response
{
  "chatId": 6,
  "message": "Chat created successfully",
  "chat": {
    "sender_user_id": "userBId",
    "receiver_user_id": "userAId",
    "chat_type": "one-to-one",
    "chat_message": "text message",
    "created_at": "2026-09-26T10:07:55.280Z"
  }
}


*/



app.post('/chat/create', async (req: Request, res: Response): Promise<any> => {
    console.log("chat started");
    try {
        const { sender_user_id, receiver_user_id,  chat_message } = req.body;

        if (!chat_message) {
          return res.status(400).json({ error: "chat_message is required to start a chat" });
        }
  

  
      // 2. Logic to create or find an existing chat room between two users
      // Replace this placeholder with your database logic (Prisma, Mongoose, Sequelize, etc.)
      const newChat = {
        sender_user_id: sender_user_id,
        receiver_user_id: receiver_user_id,
        chat_type: 'one-to-one', // default type
        chat_message:chat_message,
        created_at: new Date()
      };
  
      // Example database insert:
    //   const chat = await Chat.create({ data: newChat });

    const sql = `
  INSERT INTO chats (sender_user_id, receiver_user_id, chat_type, chat_message, created_at) 
  VALUES (?, ?, ?, ?, ?)
`;
const values = [
    newChat.sender_user_id ?? null,
    newChat.receiver_user_id ?? null,
    newChat.chat_type ?? null,
    newChat.chat_message ?? null,
    newChat.created_at ?? null
  ];
  
  // 3. Execute the query using destructuring to get the result
  const [result] = await db.execute(sql, values);
//   console.log(result.insertId);
  // 'result.insertId' will contain the auto-incremented ID of the new chat row
//   const chat = { id: result.insertId, ...newChat };
  
      // 3. Return success response
      return res.status(201).json({
        chatId:result.insertId,
        message: 'Chat created successfully',
        chat: newChat 
      });
  
    } catch (error) {
      // 4. Proper error handling
      console.error('Error creating chat:', error);
      return res.status(500).json({ 
        error: 'Internal server error failed to create chat' 
      });
    }
  });

  // 3 get messages through chat id
/*Eg
Method :get
Req URL http://localhost:3000/chat/3/messages
Response 
{
  "success": true,
  "data": {
    "id": 3,
    "sender_user_id": "userAId",
    "receiver_user_id": "userBId",
    "chat_message": "new message 3",
    "chat_type": "one-to-one",
    "created_at": "2026-09-26T09:39:11.000Z"
  }
}
*/ 
  app.get('/chat/:chatId/messages', async (req, res) => {
    // 1. Extract the chatId from the URL parameters
    const chatId = req.params.chatId;
    try {
        // 2. Fetch the specific chat data from the database
        // Replace 'messages' with your actual table name
      
        const sql = `
        SELECT id, sender_user_id, receiver_user_id, chat_message, chat_type, created_at FROM chats WHERE id = ?
      `;
      
        const [rows] = await db.execute(sql,[chatId]);

        // Check if the message/chat exists
        if (rows.length === 0) {
            return res.status(404).json({ "success": false, "message": "Chat not found" });
        }
      console.log(rows)
        // 3. Return the specific chat data
        res.status(200).json({
            "success": true,
            "data": rows[0] // Returns the specific record
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ "success": false, "message": "Database error" });
    }
});

/* 
Method : get
request url:- localhost:3000/user/userAId/chats
Response:
{
  "success": true,
  "data": [
    {
      "id": 6,
      "sender_user_id": "userBId",
      "receiver_user_id": "userAId",
      "chat_message": "text message",
      "chat_type": "one-to-one",
      "created_at": "2026-09-26T10:07:55.000Z"
    },
    {
      "id": 5,
      "sender_user_id": "userAId",
      "receiver_user_id": "userBId",
      "chat_message": "new message5",
      "chat_type": "one-to-one",
      "created_at": "2026-09-26T09:40:51.000Z"
    },
    {
      "id": 4,
      "sender_user_id": "userBId",
      "receiver_user_id": "userAId",
      "chat_message": "new message4",
      "chat_type": "one-to-one",
      "created_at": "2026-09-26T09:39:50.000Z"
    },
    {
      "id": 3,
      "sender_user_id": "userAId",
      "receiver_user_id": "userBId",
      "chat_message": "new message3",
      "chat_type": "one-to-one",
      "created_at": "2026-09-26T09:39:11.000Z"
    },
    {
      "id": 2,
      "sender_user_id": "userAId",
      "receiver_user_id": "userBId",
      "chat_message": "new message2",
      "chat_type": "one-to-one",
      "created_at": "2026-09-26T09:38:08.000Z"
    },
    {
      "id": 1,
      "sender_user_id": "userBId",
      "receiver_user_id": "userAId",
      "chat_message": "new message",
      "chat_type": "one-to-one",
      "created_at": "2026-09-26T09:14:19.000Z"
    }
  ]
}

*/
app.get('/user/:userId/chats', async (req, res) => {
    // 1. Extract the userId from the URL parameters
    const userId = req.params.userId; 

    try {
        // 2. Fetch all chats where this user is the sender OR the receiver
        const sql = `
            SELECT id, sender_user_id, receiver_user_id, chat_message, chat_type, created_at 
            FROM chats 
            WHERE sender_user_id = ? OR receiver_user_id = ?
            ORDER BY created_at DESC
        `;
        
        // Pass userId twice to fill both placeholders
        const [rows] = await db.execute(sql, [userId, userId]); 

        // 3. Return the array of chat records (even if empty)
        res.status(200).json({ 
            "success": true, 
            "data": rows // Returns the list of chats
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ "success": false, "message": "Database error" });
    }
});