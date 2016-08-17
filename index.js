const express = require('express')
const fs = require('fs')
const request = require('request')
const cheerio = require('cheerio')
const app = express()
const SpotifyWebApi = require('spotify-web-api-node')
const stringSimilarity = require('string-similarity')
const samplePlaylist = require('./data/2016-06-28.json')

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
	// Verification code
	const code = req.query.code

	const sampleSong = samplePlaylist[0]
	let progress = ''
	let playlistId = null

	spotifyApi.authorizationCodeGrant(code)
		.then(function(data) {
			console.log('The token expires in ' + data.body['expires_in']);
			console.log('The access token is ' + data.body['access_token']);
			console.log('The refresh token is ' + data.body['refresh_token']);

			// Set the access token on the API object to use it in later calls
			spotifyApi.setAccessToken(data.body['access_token']);
			spotifyApi.setRefreshToken(data.body['refresh_token']);
			// create playlist
			return spotifyApi.createPlaylist('matt_oconnell', 'My Cool Playlist', {'public': false})
		})
		// Search for track
		.then(data => {
			playlistId = data.body.id
			progress += `<br>Ok. Created playlist: ${playlistId}`
			return spotifyApi.searchTracks(`track:${sampleSong.title} artist:${sampleSong.artist}`)
		})
		// Add it to playlist
		.then(function(data) {
			res.send(111)
			const rawTrack = data.body.tracks.items[0]
			const artist = rawTrack.artists[0].name.toLowerCase() // if any artists match
			const title = rawTrack.name.toLowerCase()
			const trackId = rawTrack.id

			// See if we actually found the right song
			let artistSimilarity = stringSimilarity.compareTwoStrings(sampleSong.artist, artist)
			let titleSimilarity = stringSimilarity.compareTwoStrings(sampleSong.title, title)

			titleSimilarity = title.indexOf(sampleSong.title.toLowerCase()) !== -1 ? 1 : titleSimilarity
			artistSimilarity = artist.indexOf(sampleSong.artist.toLowerCase()) !== -1 ? 1 : artistSimilarity

			const totalSim = artistSimilarity + titleSimilarity

			if(totalSim > 1.65) {
				return spotifyApi.addTracksToPlaylist('matt_oconnell', playlistId, [`spotify:track:${trackId}`])
			} else {
				console.log(`!! totalSim for ${sampleSong.title} by ${sampleSong.artist} was ${totalSim}`)
				return false
			}
		})
		.catch(function(err) {
			console.log('ERROR', err)
			res.send(err)
		});
})

app.listen('8081')

exports = module.exports = app
