// EZCOO MX44-HAS2 HDMI Matrix Switch

const tcp = require('../../tcp')
const instance_skel = require('../../instance_skel')

class instance extends instance_skel {
	constructor(system, id, config) {
		super(system, id, config)

		this.CHOICES_INPUTS = [
			{ id: '1', label: 'IN1' },
			{ id: '2', label: 'IN2' },
			{ id: '3', label: 'IN3' },
			{ id: '4', label: 'IN4' },
		]
		this.CHOICES_OUTPUTS = [
			{ id: '1', label: 'OUT1' },
			{ id: '2', label: 'OUT2' },
			{ id: '3', label: 'OUT3' },
			{ id: '4', label: 'OUT4' },
		]
		this.pollMixerTimer = undefined
		this.selectedInput = 1
		this.outputRoute = { 1: 1, 2: 2, 3: 3, 4: 4 }
	}

	destroy() {
		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.pollMixerTimer !== undefined) {
			clearInterval(this.pollMixerTimer)
			delete this.pollMixerTimer
		}

		this.debug('destroy', this.id)
	}

	init() {
		this.updateConfig(this.config)
	}

	updateConfig(config) {
		this.config = config

		this.config.polling_interval = this.config.polling_interval !== undefined ? this.config.polling_interval : 60000
		this.config.port = this.config.port !== undefined ? this.config.port : 23

		this.initActions()
		this.initFeedbacks()
		this.initVariables()
		this.init_tcp()
		this.initPolling()
		this.initPresets()
	}

	init_tcp() {
		var backlog = ''
		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.config.host) {
			this.socket = new tcp(this.config.host, this.config.port, { reconnect_interval: 300000, reconnect: true })
			this.socket.socket.setNoDelay(false)
			this.status(this.STATUS_WARNING, 'Connecting')

			this.socket.on('status_change', (status, message) => {
				this.status(status, message)
			})

			this.socket.on('error', (err) => {
				this.debug('Network error', err)
				this.log('error', 'Network error: ' + err.message)
			})

			this.socket.on('connect', () => {
				this.sendCommmand('EZG STA') //poll current status once upon connect
				this.debug('Connected')
			})

			this.socket.on('data', (receivebuffer) => {
				backlog += receivebuffer
				var n = backlog.indexOf('\n')
				while (~n) {
					this.processResponse(backlog.substring(0, n))
					backlog = backlog.substring(n + 1)
					n = backlog.indexOf('\n')
				}
			})
		}
	}

	processResponse(receivebuffer) {
		if (this.config.log_responses) {
			this.log('info', 'Response: ' + receivebuffer)
		}
		let responses = receivebuffer.toString('utf8').split(/[\r\n]+/)
		for (let response of responses) {
			if (response.length > 0) {
				let tokens = response.split(' ')
				if (this.config.log_tokens) {
					this.log('info', 'Tokens: ' + tokens)
				}
				/*
				ADDR 00
				OUT1 VS IN1
				OUT2 VS IN2
				OUT3 VS IN3
				OUT4 VS IN4
				OUT1 STREAM ON
				OUT2 STREAM OFF
				OUT3 STREAM ON
				OUT4 STREAM OFF
				OUT1 EXA EN
				OUT2 EXA DIS
				OUT3 EXA EN
				OUT4 EXA DIS
				OUT1 VIDEO1
				OUT2 VIDEO2
				OUT3 VIDEO1
				OUT4 VIDEO2
				IN1 EDID 0
				IN2 EDID 0
				IN3 EDID 0
				IN4 EDID 0
				RIP 192.168.001.001
				HIP 192.168.001.002
				NMK 255.255.255.000
				TIP 23
				DHCP 0
				MAC 00.01.02.03.04.05

				IN1 SIG STA 0
				IN2 SIG STA 1
				IN3 SIG STA 0
				IN4 SIG STA 1
				*/
				switch (tokens[1]) {
					case 'VS':
						this.updateRoute(tokens[0].slice(-1), tokens[2].slice(-1))
						break
				}
				this.checkFeedbacks()
			}
		}
	}

	sendCommmand(cmd) {
		if (cmd !== undefined) {
			if (this.socket !== undefined && this.socket.connected) {
				this.socket.send(cmd + '\r\n')
			} else {
				this.debug('Socket not connected :(')
			}
		}
	}

	initPolling() {
		// poll to pick up switch state from possible changes from controls on the unit
		// changes usually come spontaneously, polling is just a backup mechanism
		if (this.pollMixerTimer !== undefined) {
			clearInterval(this.pollMixerTimer)
			delete this.pollMixerTimer
		}
		if (this.config.polled_data === true) {
			if (this.pollMixerTimer === undefined) {
				this.pollMixerTimer = setInterval(() => {
					this.sendCommmand('EZG STA')
				}, this.config.poll_interval)
			}
		}
	}

	updateMatrixVariables() {
		this.CHOICES_INPUTS.forEach((input) => {
			let list = ''
			for (let key in this.outputRoute) {
				if (this.outputRoute[key] == input.id) {
					list += key
				}
			}
			this.setVariable(`input_route${input.id}`, list)
		})
	}

	updateRoute(output, input) {
		if (output == 0) {
			//all outputs
			this.CHOICES_OUTPUTS.forEach((item) => {
				this.outputRoute[item.id] = input
				this.setVariable(`output_route${item.id}`, input)
			})
		} else {
			this.outputRoute[output] = input
			this.setVariable(`output_route${output}`, input)
		}
		this.updateMatrixVariables()
	}

	initVariables() {
		let variables = []
		this.CHOICES_INPUTS.forEach((item) => {
			variables.push({
				label: `Input ${item.id}`,
				name: `input_route${item.id}`,
			})
		})
		this.CHOICES_OUTPUTS.forEach((item) => {
			variables.push({
				label: `Output ${item.id}`,
				name: `output_route${item.id}`,
			})
		})
		this.setVariableDefinitions(variables)
		this.CHOICES_OUTPUTS.forEach((output) => {
			this.setVariable(`output_route${output.id}`, this.outputRoute[output.id])
		})
		this.updateMatrixVariables()
	}

	config_fields() {
		return [
			{
				type: 'text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: 'This module will connect to an EZCOO MX44-HAS2 4x4 HDMI Matrix switch.',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'IP Address',
				width: 6,
				default: '192.168.0.2',
				regex: this.REGEX_IP,
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'IP Port',
				width: 6,
				default: '23',
				regex: this.REGEX_PORT,
			},
			{
				type: 'number',
				id: 'poll_interval',
				label: 'Polling Interval (ms)',
				min: 300,
				max: 300000,
				default: 60000,
				width: 8,
			},
			{
				type: 'checkbox',
				id: 'polled_data',
				label: 'Use polled data from unit    :',
				default: false,
				width: 8,
			},
			{
				type: 'checkbox',
				id: 'log_responses',
				label: 'Log returned data    :',
				default: false,
				width: 8,
			},
			{
				type: 'checkbox',
				id: 'log_tokens',
				label: 'Log token data    :',
				default: false,
				width: 8,
			},
		]
	}

	initActions() {
		let actions = {
			select_input: {
				label: 'Select Input',
				options: [
					{
						type: 'dropdown',
						label: 'Input Port',
						id: 'input',
						default: '1',
						choices: this.CHOICES_INPUTS,
					},
				],
			},
			switch_output: {
				label: 'Switch Output',
				options: [
					{
						type: 'dropdown',
						label: 'Output Port',
						id: 'output',
						default: '1',
						choices: this.CHOICES_OUTPUTS,
					},
				],
			},
			input_output: {
				label: 'Input to Output',
				options: [
					{
						type: 'dropdown',
						label: 'Input Port',
						id: 'input',
						default: '1',
						choices: this.CHOICES_INPUTS,
					},
					{
						type: 'dropdown',
						label: 'Output Port',
						id: 'output',
						default: '1',
						choices: this.CHOICES_OUTPUTS,
					},
				],
			},
			all: {
				label: 'All outputs to selected input',
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
						choices: this.CHOICES_INPUTS,
					},
				],
			},
		}
		this.setActions(actions)
	}

	action(action) {
		let options = action.options
		switch (action.action) {
			case 'select_input':
				this.selectedInput = options.input
				break
			case 'switch_output':
				this.sendCommmand('EZS OUT' + options.output + ' VS IN' + this.selectedInput)
				this.updateRoute(options.output, this.selectedInput)
				break
			case 'input_output':
				this.sendCommmand('EZS OUT' + options.output + ' VS IN' + options.input)
				this.updateRoute(options.output, options.input)
				break
			case 'all':
				let myInput = this.selectedInput
				if (!options.selected) {
					myInput = options.input
				}
				this.sendCommmand('EZS OUT0 VS IN' + myInput)
				for (let key in this.outputRoute) {
					this.updateRoute(key, myInput)
				}
				break
		} // note that internal status values are set immediately for feedback responsiveness and will be updated again when the unit reponds (hopefully with the same value!)
		this.checkFeedbacks()
	}

	initFeedbacks() {
		let feedbacks = {}

		feedbacks.selected = {
			type: 'boolean',
			label: 'Status for input',
			description: 'Show feedback selected input',
			options: [
				{
					type: 'dropdown',
					label: 'Input',
					id: 'input',
					default: '1',
					choices: this.CHOICES_INPUTS,
				},
			],
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(255, 0, 0),
			},
			callback: (feedback, bank) => {
				let opt = feedback.options
				if (this.selectedInput == opt.input) {
					return true
				} else {
					return false
				}
			},
		}
		feedbacks.output = {
			type: 'boolean',
			label: 'Status for output',
			description: 'Show feedback selected output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: '1',
					choices: this.CHOICES_OUTPUTS,
				},
			],
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(0, 255, 0),
			},
			callback: (feedback, bank) => {
				let opt = feedback.options
				if (this.outputRoute[opt.output] == this.selectedInput) {
					return true
				} else {
					return false
				}
			},
		}
		this.setFeedbackDefinitions(feedbacks)
		this.checkFeedbacks()
	}

	initPresets() {
		let presets = []

		const aSelectPreset = (input, label) => {
			return {
				category: 'Select Input',
				label: 'Select',
				bank: {
					style: 'text',
					text: `${label}\\n> $(${this.config.label}:input_route${input})`,
					size: 'auto',
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 0),
				},
				actions: [
					{
						action: 'select_input',
						options: {
							input: input,
						},
					},
				],
				feedbacks: [
					{
						type: 'selected',
						options: {
							input: input,
						},
						style: {
							color: this.rgb(0, 0, 0),
							bgcolor: this.rgb(255, 0, 0),
						},
					},
				],
			}
		}

		const aSwitchPreset = (output, label) => {
			return {
				category: 'Switch Output',
				label: 'Switch',
				bank: {
					style: 'text',
					text: `${label}\\n< $(${this.config.label}:output_route${output})`,
					size: 'auto',
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 0),
				},
				actions: [
					{
						action: 'switch_output',
						options: {
							output: output,
						},
					},
				],
				feedbacks: [
					{
						type: 'output',
						options: {
							output: output,
						},
						style: {
							color: this.rgb(0, 0, 0),
							bgcolor: this.rgb(0, 255, 0),
						},
					},
				],
			}
		}

		const anAllPreset = (input, label) => {
			return {
				category: 'All',
				label: 'All',
				bank: {
					style: 'text',
					text: `All\\n${label}`,
					size: '18',
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(32, 0, 0),
				},
				actions: [
					{
						action: 'all',
						options: {
							selected: false,
							input: input,
						},
					},
				],
			}
		}

		this.CHOICES_INPUTS.forEach((input) => {
			presets.push(aSelectPreset(input.id, input.label))
		})
		this.CHOICES_OUTPUTS.forEach((output) => {
			presets.push(aSwitchPreset(output.id, output.label))
		})
		this.CHOICES_INPUTS.forEach((input) => {
			presets.push(anAllPreset(input.id, input.label))
		})

		presets.push({
			category: 'In to Out',
			label: 'In to Out',
			bank: {
				style: 'text',
				text: 'IN1 to OUT4',
				size: 'auto',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'input_output',
					options: {
						input: '1',
						output: '4',
					},
				},
			],
		})

		this.setPresetDefinitions(presets)
	}
}
exports = module.exports = instance
