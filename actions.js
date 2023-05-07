export function getActionDefinitions(self) {
	return {
		select_input: {
			name: 'Select Input',
			options: [
				{
					type: 'dropdown',
					label: 'Input Port',
					id: 'input',
					default: '1',
					choices: self.CHOICES_INPUTS,
				},
			],
			callback: (action) => {
				self.selectedInput = action.options.input

				self.checkFeedbacks()
			},
		},
		switch_output: {
			name: 'Switch Output',
			options: [
				{
					type: 'dropdown',
					label: 'Output Port',
					id: 'output',
					default: '1',
					choices: self.CHOICES_OUTPUTS,
				},
			],
			callback: (action) => {
				self.sendCommmand(`EZS OUT${action.options.output} VS IN${self.selectedInput}`)
				self.updateRoute(action.options.output, self.selectedInput)

				self.checkFeedbacks()
			},
		},
		input_output: {
			name: 'Input to Output',
			options: [
				{
					type: 'dropdown',
					label: 'Input Port',
					id: 'input',
					default: '1',
					choices: self.CHOICES_INPUTS,
				},
				{
					type: 'dropdown',
					label: 'Output Port',
					id: 'output',
					default: '1',
					choices: self.CHOICES_OUTPUTS,
				},
			],
			callback: (action) => {
				self.sendCommmand(`EZS OUT${action.options.output} VS IN${action.options.input}`)
				self.updateRoute(action.options.output, action.options.input)

				self.checkFeedbacks()
			},
		},
		all: {
			name: 'All outputs to selected input',
			options: [
				{
					type: 'checkbox',
					label: 'Use selected (or defined input)',
					id: 'selected',
					default: false,
				},
				{
					type: 'dropdown',
					label: 'Defined Input Port',
					id: 'input',
					default: '1',
					choices: self.CHOICES_INPUTS,
				},
			],
			callback: (action) => {
				let myInput = self.selectedInput
				if (!action.options.selected) {
					myInput = action.options.input
				}
				self.sendCommmand(`EZS OUT0 VS IN${myInput}`)
				for (let key in self.outputRoute) {
					self.updateRoute(key, myInput)
				}

				self.checkFeedbacks()
			},
		},
	}
}
