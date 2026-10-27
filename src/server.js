import express, { Request, Response } from 'express';
import { pool } from './config/db';
import { db } from './config/firebase';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// ==========================================
// 1. Create or Get Chat / Initialize Chat
// ==========================================
app.post('/chat/create', async (req: Request, res: Response): Promise<any> => {
    try {
        const { userAId, userBId } = req.body;
        if (!userAId || !userBId) {
            return res.status(400).json({ error: 'userAId and userBId are required' });
        }

        // Check if a conversation already exists between userAId and userBId
        const [rows]: [any[], any] = await pool.query(
            `SELECT id FROM chats 
             WHERE (sender_user_id = ? AND receiver_user_id = ?) 
                OR (sender_user_id = ? AND receiver_user_id = ?) 
             LIMIT 1`,
            [userAId, userBId, userBId, userAId]
        );

        if (rows.length > 0) {
            return res.status(200).json({ chatId: rows[0].id });
        }

        // Insert initial connection/chat record
        const [result]: [any, any] = await pool.query(
            `INSERT INTO chats (sender_user_id, receiver_user_id, chat_message, chat_type) VALUES (?, ?, ?, ?)`,
            [userAId, userBId, 'Chat initialized', 'one-to-one']
        );

        return res.status(201).json({ chatId: result.insertId });
    } catch (error: any) {
        console.error('Error in /chat/create:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==========================================
// 2. Send Message (Stored in MySQL matching schema)
// ==========================================
app.post('/chat/:chatId/message/send', async (req: Request, res: Response): Promise<any> => {
    try {
        const { chatId } = req.params;
        const { senderId, receiverId, text, chatType } = req.body;

        if (!senderId || !receiverId || !text) {
            return res.status(400).json({ error: 'senderId, receiverId, and text are required' });
        }

        const [result]: [any, any] = await pool.query(
            `INSERT INTO chats (sender_user_id, receiver_user_id, chat_message, chat_type) VALUES (?, ?, ?, ?)`,
            [senderId, receiverId, text, chatType || 'one-to-one']
        );

        return res.status(201).json({ 
            messageId: result.insertId, 
            chatId,
            senderId, 
            receiverId,
            text, 
            timestamp: new Date().toISOString() 
        });
    } catch (error: any) {
        console.error('Error in /chat/:chatId/message/send:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==========================================
// 3. Get Messages
// ==========================================
app.get('/chat/:chatId/messages', async (req: Request, res: Response): Promise<any> => {
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit as string) || 50;

        const [rows]: [any[], any] = await pool.query(
            `SELECT id, sender_user_id, receiver_user_id, chat_message, chat_type, created_at 
             FROM chats 
             WHERE id >= ? 
             ORDER BY created_at ASC 
             LIMIT ?`,
            [chatId, limit]
        );

        const messages = rows.map(row => ({
            messageId: row.id,
            senderId: row.sender_user_id,
            receiverId: row.receiver_user_id,
            text: row.chat_message,
            chatType: row.chat_type,
            timestamp: row.created_at
        }));

        return res.status(200).json({ messages });
    } catch (error: any) {
        console.error('Error in /chat/:chatId/messages:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==========================================
// 4. Mark Message Read (Firebase Firestore)
// ==========================================
app.post('/chat/:chatId/message/:messageId/read', async (req: Request, res: Response): Promise<any> => {
    try {
        const { chatId, messageId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const readReceiptRef = db
            .collection('chats')
            .doc(chatId)
            .collection('readReceipts')
            .doc(`${messageId}_${userId}`);

        await readReceiptRef.set({
            messageId,
            userId,
            readAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return res.status(200).json({ success: true, message: 'Message marked as read' });
    } catch (error: any) {
        console.error('Error in /chat/:chatId/message/:messageId/read:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==========================================
// 5. Update Last Seen Message (Firebase Firestore)
// ==========================================
app.post('/chat/:chatId/lastseen', async (req: Request, res: Response): Promise<any> => {
    try {
        const { chatId } = req.params;
        const { userId, messageId } = req.body;

        if (!userId || !messageId) {
            return res.status(400).json({ error: 'userId and messageId are required' });
        }

        const lastSeenRef = db
            .collection('chats')
            .doc(chatId)
            .collection('lastSeen')
            .doc(userId);

        await lastSeenRef.set({
            userId,
            messageId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return res.status(200).json({ success: true, message: 'Last seen updated successfully' });
    } catch (error: any) {
        console.error('Error in /chat/:chatId/lastseen:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==========================================
// 6. List User Chats
// ==========================================
app.get('/user/:userId/chats', async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId } = req.params;

        const [rows]: [any[], any] = await pool.query(
            `SELECT id, sender_user_id, receiver_user_id, chat_message, chat_type, created_at 
             FROM chats 
             WHERE sender_user_id = ? OR receiver_user_id = ?`,
            [userId, userId]
        );

        const chats = rows.map(row => ({
            chatId: row.id,
            senderId: row.sender_user_id,
            receiverId: row.receiver_user_id,
            message: row.chat_message,
            chatType: row.chat_type,
            createdAt: row.created_at
        }));

        return res.status(200).json({ chats });
    } catch (error: any) {
        console.error('Error in /user/:userId/chats:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Chat backend server running on port ${PORT}`);
});