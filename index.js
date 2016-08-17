const express = require('express')
const fs = require('fs')
const request = require('request')
const cheerio = require('cheerio')
const app = express()
const SpotifyWebApi = require('spotify-web-api-node')
require('dotenv').load()

const {env} = process

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
				console.log(`${dateToUse} successfully written!`)
			})
		})
	}
})

/*
 Visit this route to generate a new playlist
 */
app.get('/spotify', function(req, res) {
	const scopes = ['playlist-modify-public', 'playlist-modify-private'],
		redirectUri = 'http://localhost:8081/callback',
		clientId = env.CLIENT_ID

	const spotifyApi = new SpotifyWebApi({
		redirectUri: redirectUri,
		clientId: clientId
	});

	const authorizeURL = spotifyApi.createAuthorizeURL(scopes)

	res.redirect(authorizeURL)
})


app.get('/callback', (req, res) => {
	const credentials = {
		clientId: env.CLIENT_ID,
		clientSecret: env.CLIENT_SECRET,
		redirectUri: 'http://localhost:8081/callback'
	}

	const spotifyApi = new SpotifyWebApi(credentials)

	// The code that's returned as a query parameter to the redirect URI
	const code = req.query.code

	let progress = ''

	spotifyApi.authorizationCodeGrant(code)
		.then(function(data) {
			spotifyApi.setAccessToken(data.body['access_token']);
			return spotifyApi.getMe()
		})
		.then(function(data) {
			const id = data.body.id
			progress += `<br>User ID: ${id}`
			return spotifyApi.createPlaylist(id, 'My Cool Playlist', {'public': false})
		})
		.then(function(data) {
			progress += `<br>Ok. Created playlist here: ${data.body.tracks.href}`
			res.send(progress)
		})
		.catch(function(err) {
			res.send('Error', err.message)
		});
})

app.listen('8081')

exports = module.exports = app
