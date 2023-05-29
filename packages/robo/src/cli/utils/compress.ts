import fs from 'node:fs/promises'
import { WriteStream, createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { logger } from '../../core/logger.js'
import { finished } from 'node:stream'
import { packageJson } from './utils.js'

export interface FileMetadata {
	filePath: string
	size: number
}

export interface ArchiveMetadata {
	files: FileMetadata[]
	nodeVersion: string
	roboVersion: string
}

/**
 * Designed to provide an efficient and organized means of bundling and
 * compressing the directory contents into a single archive file. This approach benefits
 * both memory management and directory structure preservation.
 */
export async function compressDirectory(inputDir: string, outputFile: string, ignore: string[] = []) {
	logger.debug(`Compressing ${inputDir} into ${outputFile}...`)
	const fileMetadatas = await collectFileMetadatas(inputDir, inputDir, ignore)
	const archiveMetadata: ArchiveMetadata = {
		files: fileMetadatas,
		nodeVersion: process.version,
		roboVersion: 'v' + packageJson.version
	}
	logger.debug(`Compressing ${fileMetadatas.length} files...`)

	// Ensuring the output directory exists before attempting to write
	const outputDir = path.dirname(outputFile)
	try {
		await fs.access(outputDir)
	} catch {
		await fs.mkdir(outputDir, { recursive: true })
	}

	const writeStream = createWriteStream(outputFile)

	try {
		// Serialize metadata into a string and calculate its length in bytes
		const metadataString = JSON.stringify(archiveMetadata)
		const metadataLength = Buffer.byteLength(metadataString)

		// Write metadata length (4 bytes) and metadata to the beginning of the archive
		const metadataLengthBuffer = Buffer.alloc(4)
		metadataLengthBuffer.writeInt32BE(metadataLength)
		writeStream.write(metadataLengthBuffer)
		writeStream.write(metadataString)
		logger.debug(`Wrote ${metadataLength} bytes of metadata to the archive`)

		// Compress each file and write it to the archive
		for (const metadata of fileMetadatas) {
			try {
				logger.debug(`Compressing ${metadata.size} bytes of data for ${metadata.filePath}...`)
				await compressFile(metadata.filePath, writeStream)
			} catch (e) {
				logger.error(`Failed to compress ${metadata.filePath}:`, e)
				throw e
			}
		}
	} finally {
		logger.debug(`Finished compressing ${fileMetadatas.length} files into ${outputFile}`)
		writeStream.end()
	}
}

/**
 * Employs streams to manage memory consumption effectively during the
 * compression process, particularly for large files.
 */
async function compressFile(filePath: string, writeStream: WriteStream): Promise<void> {
	const readStream = createReadStream(path.join(process.cwd(), filePath))
	const gzip = zlib.createGzip()

	return new Promise<void>((resolve, reject) => {
		readStream.on('error', reject).pipe(gzip).on('error', reject).pipe(writeStream, { end: false }).on('error', reject)
		finished(gzip, (err) => {
			if (err) {
				reject(err)
			} else {
				resolve()
			}
		})
	})
}

/**
 * Compiles metadata that assists in the proper reconstruction of the
 * original directory and its files upon decompression. A recursive approach allows
 * accommodation for directories of arbitrary depth.
 */
async function collectFileMetadatas(dirPath: string, baseDir: string, ignore: string[]): Promise<FileMetadata[]> {
	let results: FileMetadata[] = []
	const entries = await fs.readdir(dirPath, { withFileTypes: true })

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name)
		const relativePath = path.relative(baseDir, fullPath)

		// Skip directories that are in the ignore list
		if (ignore.some((i) => relativePath === i || relativePath.startsWith(i + path.sep))) {
			continue
		}

		if (entry.isDirectory()) {
			const subdirResults = await collectFileMetadatas(fullPath, baseDir, ignore)
			results = results.concat(subdirResults)
		} else if (entry.isFile()) {
			const stats = await fs.stat(fullPath)
			results.push({ filePath: fullPath, size: stats.size })
		}
	}

	return results
}
