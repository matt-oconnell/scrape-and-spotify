const express = require('express')
const fs = require('fs')
const request = require('request')
const cheerio = require('cheerio')
const async = require('async')
const app = express()
const SpotifyWebApi = require('spotify-web-api-node')
const stringSimilarity = require('string-similarity')
let playlistName = 'WFUV'
// const songs = require(`./data/${playlistName}.json`)
const ProgressBar = require('progress')
const _ = require('lodash')
var glob = require("glob")

require('dotenv').load()

const {env} = process

app.get('/scrape', function(req, res) {

	const d = new Date()
	let dateToUse = null
	let urls = []
	const count = 100
	let bar = new ProgressBar(':bar', {total: count});

	for(let i = count; i > 0; i--) {
		d.setDate(d.getDate() - 1)
		dateToUse = d.toISOString().split('T')[0]
		const url = `http://nowplaying.wfuv.org/pleditor/external/playlist.php?id=2&day=${dateToUse}`
		urls.push(url)
	}

	async.eachLimit(urls, 10,
		function(url, callback) {
			scrape(url, callback)
		},
		function(err, data) {
			if(err) {
				console.log('Error scraping and stuff', err)
			} else {
				console.log('Done', data)
			}
		}
	)
})

function scrape(url, callback) {
	request(url, function(error, response, html) {
		if(!error) {
			const $ = cheerio.load(html)
			const title = $('#date').val()
			const songs = []
			console.log(`scraping ${title}`)


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
				console.log(`Nothin good for ${url}`)
			}
			writeToFile(title, songs, callback)
		} else {
			console.log(`Error`, error)
		}
	})
}

function writeToFile(title, songs, callback) {
	fs.writeFile(`data/${title}.json`, JSON.stringify(songs, null, 4), function(err) {
		console.log(`${title} successfully written!`)
		callback(null, title)
		if(err) {
			console.log('error writing to file', err)
		}
	})
}


app.get('/callback', function(req, res) {

	// Get all JSON files
	glob('data/*.json', {}, function(er, files) {
		let arr = []
		async.eachLimit(files, 10,
			function(item, callback) {
				fs.readFile(item, 'utf8', function(err, data) {
					if(err) throw err;
					let parsedJSON = JSON.parse(data);
					arr = arr.concat(parsedJSON)
					callback(null, arr)
				});
			},
			function(err) {
				if(err) {
					console.log('Error reading files', err)
				} else {
					// End of Read
					arr = _.uniqBy(arr, 'title')
					console.log('End', arr)
					createPlaylist(arr, req, res)
				}
			}
		)
	})
})

function createPlaylist(songs, req, res) {
	const credentials = {
		clientId: env.CLIENT_ID,
		clientSecret: env.CLIENT_SECRET,
		redirectUri: 'http://localhost:8081/callback'
	}
	const spotifyApi = new SpotifyWebApi(credentials)
	// Verification code
	const code = req.query.code

	let playlistId = null
	let trackId = null

	/* Auth flow */
	spotifyApi.authorizationCodeGrant(code)
		.then(data => {
			spotifyApi.setAccessToken(data.body['access_token'])
			spotifyApi.setRefreshToken(data.body['refresh_token'])
			return spotifyApi.createPlaylist('matt_oconnell', playlistName, {'public': false})
		})
		.then(data => {
			playlistId = data.body.id
			console.log(`Ok. Created playlist: ${playlistId}`)

			let bar = new ProgressBar(':bar', {total: songs.length});

			/* Loop through playlist */
			async.eachLimit(songs, 1, function(song, callback) {
					console.log('Song: ', song)
					setTimeout(() => {
						/* Search and add a song */
						spotifyApi.searchTracks(`track:${song.title} artist:${song.artist}`)
							.then(data => {
								const rawTrack = data.body.tracks.items[0]
								if(!rawTrack || !rawTrack.artists || !rawTrack.artists[0] || !rawTrack.artists[0].name) {
									callback(null, song)
									return
								}
								const artist = rawTrack.artists[0].name.toLowerCase() // if any artists match
								const title = rawTrack.name.toLowerCase()
								const trackId = rawTrack.id

								// See if we actually found the right song
								let artistSimilarity = stringSimilarity.compareTwoStrings(song.artist, artist)
								let titleSimilarity = stringSimilarity.compareTwoStrings(song.title, title)

								titleSimilarity = title.indexOf(song.title.toLowerCase()) !== -1 ? 1 : titleSimilarity
								artistSimilarity = artist.indexOf(song.artist.toLowerCase()) !== -1 ? 1 : artistSimilarity

								const totalSim = artistSimilarity + titleSimilarity

								if(totalSim > 1.65) {
									console.log('yes yes yes', song.title)
									return spotifyApi.addTracksToPlaylist('matt_oconnell', playlistId, [`spotify:track:${trackId}`])
								} else {
									return new Error('Total sim too low', totalSim)
								}
							})
							.then(data => {
								bar.tick()
								if(!data.body) {
									callback(null, data)
									return
								}
								console.log('Ok, added song', data.body.snapshot_id)
								callback(null, 'done')
							})
							.catch(e => console.log('Error searching and adding track ', e))
					}, 100)
				},
				// EACH Final
				function(err) {
					// All tasks are done now
					if(err) {
						console.log('Error', err)
					} else {
						console.log('All done.')
					}
				}
			)
		})
		.catch(e => {
			console.log('outside error', e)
		})
}


/*
 clean up.
 */
app.get('/callback', function(req, res) {


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

app.listen('8081')

exports = module.exports = app
