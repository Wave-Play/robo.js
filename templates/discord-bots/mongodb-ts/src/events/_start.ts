import mongoose from 'mongoose'
import { logger } from 'robo.js'

const userSchema = new mongoose.Schema({
	name: String,
	email: String,
	age: Number
})

export const User = mongoose.model('Userz', userSchema)

export default async () => {
	await mongoose.connect(process.env.MONGODB_URI)
	logger.info('Connected to MongoDB')
}
