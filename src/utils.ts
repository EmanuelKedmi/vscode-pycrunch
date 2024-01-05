export function assert(condition: boolean, message: string, errorCls: typeof Error = Error) {
	if (!condition) {
		throw new errorCls(message);
	}
}
