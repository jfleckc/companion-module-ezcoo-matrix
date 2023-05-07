import { InstanceBase, InstanceStatus, TCPHelper, runEntrypoint } from '@companion-module/base'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { getPresetDefinitions } from './presets.js'
import { getConfigFields } from './config.js'

class EzcooMatrixInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

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

	getConfigFields() {
		return getConfigFields()
	}

	async destroy() {
		if (this.socket) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.pollMixerTimer) {
			clearInterval(this.pollMixerTimer)
			delete this.pollMixerTimer
		}
	}

	async init(config) {
		await this.configUpdated(config)
	}

	async configUpdated(config) {
		this.config = config

		this.config.polling_interval = this.config.polling_interval ?? 60000
		this.config.port = this.config.port ?? 23

		this.setActionDefinitions(getActionDefinitions(this))
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
		this.setPresetDefinitions(getPresetDefinitions(this))
		this.initVariables()

		this.initTcpSocket()
		this.initPolling()
	}

	initTcpSocket() {
		if (this.socket) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.config.host) {
			this.socket = new TCPHelper(this.config.host, this.config.port, {
				reconnect_interval: 10000,
				reconnect: true,
			})
			this.socket._socket.setNoDelay(true)

			this.updateStatus(InstanceStatus.Connecting)

			this.socket.on('status_change', (status, message) => {
				this.updateStatus(status, message)
			})

			this.socket.on('error', (err) => {
				this.log('error', 'Network error: ' + err.message)
			})

			this.socket.on('connect', () => {
				this.log('info', 'Connected')
				this.sendCommmand('EZG STA') //poll current status once upon connect
			})

			let receiveBacklog = ''
			this.socket.on('data', (receivebuffer) => {
				receiveBacklog += receivebuffer
				let n = receiveBacklog.indexOf('\n')
				while (~n) {
					this.processResponse(receiveBacklog.substring(0, n))
					receiveBacklog = receiveBacklog.substring(n + 1)
					n = receiveBacklog.indexOf('\n')
				}
			})
		}
	}

	processResponse(receivebuffer) {
		if (this.config.log_responses) {
			this.log('debug', 'Response: ' + receivebuffer)
		}

		let responses = receivebuffer.toString('utf8').split(/[\r\n]+/)
		for (let response of responses) {
			if (response.length > 0) {
				let tokens = response.split(' ')
				if (this.config.log_tokens) {
					console.log('Tokens: ' + tokens)
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
			if (this.socket !== undefined && this.socket.isConnected) {
				this.socket.send(cmd + '\r\n').catch((e) => {
					this.log('debug', `Send failed: ${e?.message ?? e}`)
				})
			} else {
				this.log('debug', 'Socket not connected :(')
			}
		}
	}

	initPolling() {
		// poll to pick up switch state from possible changes from controls on the unit
		// changes usually come spontaneously, polling is just a backup mechanism
		if (this.pollMixerTimer) {
			clearInterval(this.pollMixerTimer)
			delete this.pollMixerTimer
		}

		if (this.config.polled_data) {
			this.pollMixerTimer = setInterval(() => {
				this.sendCommmand('EZG STA')
			}, this.config.poll_interval)
		}
	}

	updateVariableValues() {
		// This is not the most efficient to always update everything, but we have so few it isnt a problem
		const variableValues = {}

		for (const input of this.CHOICES_INPUTS) {
			let list = ''
			for (let key in this.outputRoute) {
				if (this.outputRoute[key] == input.id) {
					list += key
				}
			}
			variableValues[`input_route${input.id}`] = list
		}

		for (const output of this.CHOICES_OUTPUTS) {
			variableValues[`output_route${output.id}`] = this.outputRoute[output.id]
		}

		this.setVariableValues(variableValues)
	}

	updateRoute(output, input) {
		if (!this.socket.isConnected) return

		if (output == 0) {
			//all outputs
			this.CHOICES_OUTPUTS.forEach((item) => {
				this.outputRoute[item.id] = input
			})
		} else {
			this.outputRoute[output] = input
		}

		this.updateVariableValues()
	}

	initVariables() {
		let variableDefinitions = []
		this.CHOICES_INPUTS.forEach((item) => {
			variableDefinitions.push({
				variableId: `input_route${item.id}`,
				name: `Input ${item.id}`,
			})
		})
		this.CHOICES_OUTPUTS.forEach((item) => {
			variableDefinitions.push({
				variableId: `output_route${item.id}`,
				name: `Output ${item.id}`,
			})
		})
		this.setVariableDefinitions(variableDefinitions)

		this.updateVariableValues()
	}
}

runEntrypoint(EzcooMatrixInstance, [])
