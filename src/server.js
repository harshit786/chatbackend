import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './config/db';
import { db } from './config/firebase';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// ==========================================
// 1. Create or Get Chat
// ==========================================
app.post('/chat/create', async (req: Request, res: Response): Promise<any> => {
    try {
        const { userAId, userBId } = req.body;
        if (!userAId || !userBId) {
            return res.status(400).json({ error: 'userAId and userBId are required' });
        }

        // Check if chat already exists between userAId and userBId in either direction
        const [rows]: [any[], any] = await pool.query(
            `SELECT id FROM chats 
             WHERE (user_a_id = ? AND user_b_id = ?) 
                OR (user_a_id = ? AND user_b_id = ?)`,
            [userAId, userBId, userBId, userAId]
        );

        if (rows.length > 0) {
            return res.status(200).json({ chatId: rows[0].id });
        }

        // Create new chat
        const chatId = uuidv4();
        await pool.query(
            `INSERT INTO chats (id, user_a_id, user_b_id) VALUES (?, ?, ?)`,
            [chatId, userAId, userBId]
        );

        return res.status(201).json({ chatId });
    } catch (error: any) {
        console.error('Error in /chat/create:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==========================================
// 2. Send Message
// ==========================================
app.post('/chat/:chatId/message/send', async (req: Request, res: Response): Promise<any> => {
    try {
        const { chatId } = req.params;
        const { senderId, text } = req.body;

        if (!senderId || !text) {
            return res.status(400).json({ error: 'senderId and text are required' });
        }

        const messageRef = db.collection('chats').doc(chatId).collection('messages').doc();
        const messageData = {
            id: messageRef.id,
            senderId,
            text,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        await messageRef.set(messageData);

        return res.status(201).json({ 
            messageId: messageRef.id, 
            senderId, 
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

        const messagesSnapshot = await db
            .collection('chats')
            .doc(chatId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .limit(limit)
            .get();

        const messages = messagesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                timestamp: data.timestamp ? data.timestamp.toDate() : null
            };
        });

        return res.status(200).json({ messages });
    } catch (error: any) {
        console.error('Error in /chat/:chatId/messages:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==========================================
// 4. Mark Message Read
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
// 5. Update Last Seen Message
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
            `SELECT id, user_a_id, user_b_id, created_at 
             FROM chats 
             WHERE user_a_id = ? OR user_b_id = ?`,
            [userId, userId]
        );

        const chats = rows.map(row => ({
            chatId: row.id,
            members: [row.user_a_id, row.user_b_id],
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