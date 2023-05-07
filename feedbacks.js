import { combineRgb } from '@companion-module/base'

export function getFeedbackDefinitions(self) {
	return {
		selected: {
			type: 'boolean',
			name: 'Status for input',
			description: 'Show feedback selected input',
			options: [
				{
					type: 'dropdown',
					label: 'Input',
					id: 'input',
					default: '1',
					choices: self.CHOICES_INPUTS,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 0, 0),
			},
			callback: (feedback) => {
				return self.selectedInput == feedback.options.input
			},
		},
		output: {
			type: 'boolean',
			name: 'Status for output',
			description: 'Show feedback selected output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: '1',
					choices: self.CHOICES_OUTPUTS,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(0, 255, 0),
			},
			callback: (feedback) => {
				return self.outputRoute[feedback.options.output] == self.selectedInput
			},
		},
	}
}
