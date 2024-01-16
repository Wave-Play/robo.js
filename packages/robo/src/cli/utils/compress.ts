import fs from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { logger } from '../../core/logger.js'
import { pipeline } from 'node:stream/promises'
import { packageJson } from './utils.js'

export interface FileMetadata {
	compressedSize?: number
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

	// Create temp directory
	const tempDir = outputFile.slice(0, outputFile.lastIndexOf('.'))
	logger.debug(`Creating temporary directory at`, tempDir)
	await fs.mkdir(tempDir, { recursive: true })
	const tempFilePaths: Record<string, string> = {}

	try {
		// Compress each file and write it to a temporary file
		await Promise.all(
			fileMetadatas.map(async (metadata) => {
				try {
					logger.debug(`Compressing ${metadata.size} bytes of data for ${metadata.filePath}...`)
					let cleanFileName = metadata.filePath.replaceAll(path.sep, '-')
					if (cleanFileName.startsWith('-')) {
						cleanFileName = cleanFileName.slice(1)
					}

					const tempFilePath = path.join(tempDir, cleanFileName + '.tmp')
					logger.debug(`Writing compressed data to`, tempFilePath)
					await compressFile(metadata.filePath, tempFilePath)
					tempFilePaths[metadata.filePath] = tempFilePath

					const stats = await fs.stat(tempFilePath)
					metadata.compressedSize = stats.size
					logger.debug(`Compressed ${metadata.size} bytes of data into ${metadata.compressedSize} bytes`)
				} catch (e) {
					logger.error(`Failed to compress ${metadata.filePath}:`, e)
					throw e
				}
			})
		)

		// Write metadata and compressed files to the archive
		const writeStream = createWriteStream(outputFile)

		// Serialize metadata into a string and calculate its length in bytes
		const metadataString = JSON.stringify(archiveMetadata)
		const metadataLength = Buffer.byteLength(metadataString)

		// Write metadata length (4 bytes) and metadata to the beginning of the archive
		const metadataLengthBuffer = Buffer.alloc(4)
		metadataLengthBuffer.writeInt32BE(metadataLength)
		writeStream.write(metadataLengthBuffer)
		writeStream.write(metadataString)
		logger.debug(`Wrote ${metadataLength} bytes of metadata to the archive`)

		// Write files
		for (const metadata of fileMetadatas) {
			const readStream = createReadStream(tempFilePaths[metadata.filePath])
			for await (const chunk of readStream) {
				writeStream.write(chunk)
			}
		}
		writeStream.end()
	} finally {
		logger.debug(`Finished compressing ${fileMetadatas.length} files into ${outputFile}`)
	}

	// Cleanup temporary files
	await Promise.all(Object.values(tempFilePaths).map((tempFilePath) => fs.unlink(tempFilePath)))
	await fs.rm(tempDir, { force: true, recursive: true })
}

/**
 * Employs streams to manage memory consumption effectively during the
 * compression process, particularly for large files.
 */
async function compressFile(filePath: string, outputFile: string) {
	const readStream = createReadStream(path.join(process.cwd(), filePath))
	const writeStream = createWriteStream(outputFile)
	const brotli = zlib.createBrotliCompress()

	await pipeline(readStream, brotli, writeStream)
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
			results.push({ filePath: fullPath.replace(process.cwd(), ''), size: stats.size })
		}
	}

	return results
}
