import mongoose from 'mongoose'

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Here we connect to the database
// It has been moved outside of the ready event so we don't have to wait on discord
// [Application startup] -> [client.login()] -> [Discord responds] -> [Ready event] -> [Database connection]
//
// This way we can connect to the database while waiting for discord to respond
// [Application startup] -> [Database connection] -> [client.login()] -> [Discord responds] -> [Ready event]
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
export default async () => {
	if (!process.env.MONGO_URL) {
		return console.warn('MongoDB URL is not provided in the .env file, skipping database connection...')
	}
	await mongoose.connect(process.env.MONGO_URL)
}
