export function compare(obj1: Record<string, unknown>, obj2: Record<string, unknown>, keys: string[]): string[] {
	const differentFields: string[] = []

	keys.forEach((key) => {
		// Check if both objects have the key
		if (obj1[key] && obj2[key]) {
			const value1 = obj1[key]
			const value2 = obj2[key]

			// Compare values based on their type
			if (typeof value1 !== 'object' && typeof value2 !== 'object') {
				if (value1 !== value2) {
					differentFields.push(key)
				}
			} else {
				// Object or array: compare stringified values (but sort arrays first)
				if (Array.isArray(value1)) {
					value1.sort()
				}
				if (Array.isArray(value2)) {
					value2.sort()
				}
				if (JSON.stringify(value1) !== JSON.stringify(value2)) {
					differentFields.push(key)
				}
			}
		} else {
			// Key does not exist in one of the objects
			differentFields.push(key)
		}
	})

	return differentFields
}

export function hasProperties<T extends Record<string, unknown>>(
	obj: unknown,
	props: (keyof T)[]
): obj is T & Record<keyof T, unknown> {
	return typeof obj === 'object' && obj !== null && props.every((prop) => prop in obj)
}
