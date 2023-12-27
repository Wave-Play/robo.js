import fastify from 'fastify'
import SQLite from 'better-sqlite3'

const db = new SQLite('test.db')

// Create a Fastify instance
const app = fastify()

// Define the GET route
app.route({
	method: 'GET',
	url: '/simple',
	schema: {
		response: {
			200: {
				type: 'object',
				properties: {
					hello: { type: 'string' }
				}
			}
		}
	},
	handler: async () => {
		const now = new Date()
		console.log(`${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}.${now.getMilliseconds()}`)
		return 'Hello, World!'
	}
})

// CRUD Operations
app.route({
	method: 'POST',
	url: '/create',
	schema: {
		body: {
			type: 'object',
			properties: {
				data: { type: 'string' }
			}
		},
		response: {
			200: {
				type: 'object',
				properties: {
					id: { type: 'number' }
				}
			}
		}
	},
	handler: async (request) => {
		const { data } = request.body
		console.log(`POST /create`)

		const stmt = db.prepare(`INSERT INTO test (data) VALUES (?)`)
		const info = stmt.run(data)

		return { id: info.lastInsertRowid }
	}
})

app.route({
	method: 'GET',
	url: '/read/:id',
	schema: {
		params: {
			type: 'object',
			properties: {
				id: { type: 'number' }
			}
		},
		response: {
			200: {
				type: 'object',
				properties: {
					id: { type: 'number' },
					data: { type: 'string' }
				}
			}
		}
	},
	handler: async (request) => {
		const { id } = request.params
		console.log(`GET /read/${id}`)

		const stmt = db.prepare(`SELECT * FROM test WHERE id = ?`)
		const row = stmt.get(id)

		return row
	}
})

app.route({
	method: 'PUT',
	url: '/update/:id',
	schema: {
		params: {
			type: 'object',
			properties: {
				id: { type: 'number' }
			}
		},
		body: {
			type: 'object',
			properties: {
				data: { type: 'string' }
			}
		},
		response: {
			200: {
				type: 'object',
				properties: {
					modified: { type: 'number' }
				}
			}
		}
	},
	handler: async (request) => {
		const { id } = request.params
		console.log(`PUT /update/${id}`)

		const { data } = request.body
		const stmt = db.prepare(`UPDATE test SET data = ? WHERE id = ?`)
		const info = stmt.run(data, id)

		return { modified: info.changes }
	}
})

app.route({
	method: 'DELETE',
	url: '/delete/:id',
	schema: {
		params: {
			type: 'object',
			properties: {
				id: { type: 'number' }
			}
		},
		response: {
			200: {
				type: 'object',
				properties: {
					deleted: { type: 'number' }
				}
			}
		}
	},
	handler: async (request) => {
		const { id } = request.params
		console.log(`DELETE /delete/${id}`)

		const stmt = db.prepare(`DELETE FROM test WHERE id = ?`)
		const info = stmt.run(id)

		return { deleted: info.changes }
	}
})

// CPU Intensive Endpoint
app.route({
	method: 'GET',
	url: '/cpu-intensive',
	schema: {
		response: {
			200: {
				type: 'object',
				properties: {
					result: { type: 'number' }
				}
			}
		}
	},
	handler: async () => {
		let result = 0
		for (let i = 0; i < 1000000; i++) {
			result += Math.sqrt(i)
		}

		return { result }
	}
})

// Start the server
app.listen({ port: 4903 }, (err) => {
	if (err) {
		console.error(err)
		process.exit(1)
	}

	db.prepare(`CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, data TEXT)`).run()
	console.log('Server is live on port 4903')
})
