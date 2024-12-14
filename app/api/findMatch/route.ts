import { NextResponse } from 'next/server';
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { uid, isSpeedGame, isNormalGame } = body;

    if (!uid || typeof isSpeedGame !== 'boolean' || typeof isNormalGame !== 'boolean') {
      return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
    }

    const usersCollection = db.collection('users');
    const gamesCollection = db.collection('game');

    let matchedPlayer: FirebaseFirestore.DocumentData | null = null;
    const requestingPlayerSnapshot = await usersCollection.doc(uid).get();

    if (!requestingPlayerSnapshot.exists) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    const requestingPlayer = requestingPlayerSnapshot.data();
    const level = requestingPlayer?.level;

    if (typeof level !== 'number') {
      return NextResponse.json({ message: 'Invalid user data' }, { status: 400 });
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
      return NextResponse.json({ message: 'No match found' }, { status: 404 });
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

    return NextResponse.json({ gameId: gameDocument.id }, { status: 200 });
  } catch (error) {
    console.error('Error creating game:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
