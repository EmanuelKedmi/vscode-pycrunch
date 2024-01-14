// require.resolve(`../images/${icon}.svg`)

import { Uri } from "vscode";
import { ITestResult } from "./engine";

export function fqnToIcon(test: ITestResult): string {
	let candidateIconName = "uncovered";

	switch (test.status) {
		case "success":
			candidateIconName = "covered";
			break;
		case "failed":
			candidateIconName = "errorSource";
			break;
		default:
			candidateIconName = "uncovered";
	}

	return require.resolve(`../images/${candidateIconName}.svg`);
}
