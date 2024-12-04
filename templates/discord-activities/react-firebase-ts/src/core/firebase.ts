import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { patchUrlMappings } from '@discord/embedded-app-sdk'

// Change these to your Firebase project's configuration
const firebaseConfig = {
	apiKey: '',
	authDomain: '',
	projectId: '',
	storageBucket: '',
	messagingSenderId: '',
	appId: '',
	measurementId: ''
}

// Patches Firebase packages to use the mapped Firestore URL
patchUrlMappings([{ prefix: '/firestore', target: 'firestore.googleapis.com' }])

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

export const Firebase = { app, db }
