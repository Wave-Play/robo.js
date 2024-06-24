import copy from 'copy-to-clipboard'

export const useClipboard = () => {
	return [async (text) => copy(text)]
}
