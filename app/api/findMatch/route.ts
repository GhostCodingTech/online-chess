import { NextApiRequest, NextApiResponse } from 'next';
import admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  }

const db = admin.firestore();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { uid, isSpeedGame, isNormalGame } = req.body;

  if (!uid || typeof isSpeedGame !== 'boolean' || typeof isNormalGame !== 'boolean') {
    return res.status(400).json({ message: 'Invalid input' });
  }

  try {
    const usersCollection = db.collection('users');
    const gamesCollection = db.collection('game');

    let matchedPlayer: FirebaseFirestore.DocumentData | null = null;
    const requestingPlayerSnapshot = await usersCollection.doc(uid).get();

    if (!requestingPlayerSnapshot.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const requestingPlayer = requestingPlayerSnapshot.data();
    const level = requestingPlayer?.level;

    if (typeof level !== 'number') {
      return res.status(400).json({ message: 'Invalid user data' });
    }

    const startTime = Date.now();
    const maxDuration = 2000; // 2 seconds

    // Search for a match
    while (Date.now() - startTime < maxDuration) {
      const snapshot = await usersCollection
        .where('level', '>=', level - 1)
        .where('level', '<=', level + 1)
        .where('searchingSpeed', '==', isSpeedGame)
        .where('searchingNormal', '==', isNormalGame)
        .get();

      for (const doc of snapshot.docs) {
        if (doc.id !== uid) {
          matchedPlayer = doc;
          break;
        }
      }

      if (matchedPlayer) break;

      await new Promise((resolve) => setTimeout(resolve, 200)); // Slight delay for better match simulation
    }

    if (!matchedPlayer) {
      return res.status(404).json({ message: 'No match found' });
    }

    // Randomly assign black or white player
    const isRequestingPlayerBlack = Math.random() < 0.5;
    const blackPlayer = isRequestingPlayerBlack ? uid : matchedPlayer.id;
    const whitePlayer = isRequestingPlayerBlack ? matchedPlayer.id : uid;

    // Create the game document
    const gameDocument = await gamesCollection.add({
      black_player: usersCollection.doc(blackPlayer),
      white_player: usersCollection.doc(whitePlayer),
      isSpeedGame,
      current_turn: usersCollection.doc(whitePlayer), // White always starts
      game_finished: false,
      game_result: '',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    });

    return res.status(200).json({ gameId: gameDocument.id });
  } catch (error) {
    console.error('Error creating game:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
