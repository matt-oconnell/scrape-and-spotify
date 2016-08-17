const express = require('express')
const fs = require('fs')
const request = require('request')
const cheerio = require('cheerio')
const app = express()

app.get('/scrape', function() {

	const d = new Date()
	let dateToUse = null
	for(let i = 50; i > 0; i--) {

		d.setDate(d.getDate() - 1)
		dateToUse = d.toISOString().split('T')[0]
		const url = `http://nowplaying.wfuv.org/pleditor/external/playlist.php?id=2&day=${dateToUse}`
		const json = {}

		request(url, function(error, response, html) {
			if(!error) {
				const $ = cheerio.load(html)

				const title = $('#date').val()
				const songs = []

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

				if(!title) {
					console.log(`Nothin good for ${dateToUse}`)
				}

			} else {
				console.log(`Error`, error)
			}

			fs.writeFile(`data/${title}.json`, JSON.stringify(songs, null, 4), function(err) {
				console.log(`${dateToUse} successfully written!`);
			})
		})
	}
})
app.listen('8081')

console.log('Magic happens on port 8081')

exports = module.exports = app