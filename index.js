const express = require('express')
const fs = require('fs')
const request = require('request')
const cheerio = require('cheerio')
const async = require('async')
const app = express()
const SpotifyWebApi = require('spotify-web-api-node')
const stringSimilarity = require('string-similarity')
let playlistName = '2016-05-10'
const samplePlaylist = require(`./data/${playlistName}.json`)
const ProgressBar = require('progress');

require('dotenv').load()

const {env} = process

app.get('/scrape', function(req, res) {

	const d = new Date()
	let dateToUse = null
	let urls = []
	for(let i = 100; i > 0; i--) {
		d.setDate(d.getDate() - 1)
		dateToUse = d.toISOString().split('T')[0]
		const url = `http://nowplaying.wfuv.org/pleditor/external/playlist.php?id=2&day=${dateToUse}`
		urls.push(url)
	}
	// res.send(queue)
	const q = async.queue(scrape, 10)

	let results = []

	q.drain = () => {
		console.log('URLs Scraped....')
		const writeQ = async.queue(writeToFile, 5)
		results.forEach(playlist => {
			writeQ.push(playlist, (title) => {
				console.log(`Queue: Finished writing ${title}`)
			})
		})
	}

	urls.forEach(url => {
		q.push(url, (title, songs) => {
			results.push({title: title, songs: songs})
			console.log(`Queue: Finished processing ${title}. ${songs.length} songs.`)
		})
	})

})

function scrape(url, callback) {
	request(url, function(error, response, html) {
		if(!error) {
			const $ = cheerio.load(html)

			const title = $('#date').val()
			const songs = []
			const json = {}

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

			callback(title, songs)

		} else {
			console.log(`Error`, error)
		}

	})
}

function writeToFile(playlist, callback) {
	const {title, songs} = playlist
	fs.writeFile(`data/${title}.json`, JSON.stringify(songs, null, 4), function(err) {
		console.log(`${title} successfully written!`)
		callback(title)
	})
}


/*
 clean up.
 */
app.get('/callback', function(req, res) {

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

			// let sampleSong = samplePlaylist[0]

			const bar = new ProgressBar(':bar', {total: samplePlaylist.length});

			/* Loop through playlist */
			async.eachLimit(samplePlaylist, 1, function(item, callback) {
					let sampleSong = item
					console.log('Sample Song', sampleSong)
					setTimeout(() => {
						/* Search and add a song */
						spotifyApi.searchTracks(`track:${sampleSong.title} artist:${sampleSong.artist}`)
							.then(data => {
								const rawTrack = data.body.tracks.items[0]
								if(!rawTrack || !rawTrack.artists || !rawTrack.artists[0] || !rawTrack.artists[0].name) {
									callback(null, sampleSong)
									return
								}
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
									console.log('yes yes yes', sampleSong.title)
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
