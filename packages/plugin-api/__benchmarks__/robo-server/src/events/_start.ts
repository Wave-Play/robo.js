import SQLite from 'better-sqlite3'

export const db = new SQLite('test.db')

export default () => {
	db.prepare(`CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, data TEXT)`).run()
}
