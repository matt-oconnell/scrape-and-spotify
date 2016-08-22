const ProgressBar = require('progress')
const request = require('request')
const cheerio = require('cheerio')
const async = require('async')
const fs = require('fs')

const config = require('./config')

const bar = new ProgressBar(':bar', {total: config.count})
const d = new Date()
let dateToUse = null
let urls = []

for(let i = config.count; i > 0; i--) {
	d.setDate(d.getDate() - 1)
	dateToUse = d.toISOString().split('T')[0]
	const url = `http://nowplaying.wfuv.org/pleditor/external/playlist.php?id=2&day=${dateToUse}`
	urls.push(url)
}

async.eachLimit(urls, 10,
	(url, callback) => {
		if(url) {
			scrape(url, callback)
		}
	},
	(err, data) => {
		if(err) {
			console.log(err)
		} else {
			console.log('Done', data)
		}
	}
)

function scrape(url, callback) {
	request(url, (error, response, html) => {
		if(!error) {
			const $ = cheerio.load(html)
			const title = $('#date').val()
			const songs = []

			if(!title || title == 'undefined') {
				callback(null, `Invalid file @ ${url}`)
				return
			}

			console.log(`Scraping ${title}`)

			// Artists
			$('.music td:nth-child(2)').each((i, el) => {
				songs[i] = {
					artist: $(el).text(),
					title: null
				}
			})
			// Titles
			$('.music td:nth-child(3)').each((i, el) => {
				songs[i].title = $(el).text()
			})

			writeToFile(title, songs, callback)
		} else {
			console.log(`Request error`, error)
		}
	})
}

function writeToFile(title, songs, callback) {
	if(!fs.existsSync(config.dir)) {
		fs.mkdirSync(config.dir)
	}
	fs.writeFile(`${config.dir}/${title}.json`, JSON.stringify(songs, null, 4), err => {
		console.log(`${title} successfully written!`)
		callback(null, title)
		if(err) {
			console.log('Error writing to file', err)
		}
	})
}