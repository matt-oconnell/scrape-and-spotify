const stringSimilarity = require('string-similarity')
const SpotifyWebApi = require('spotify-web-api-node')
const ProgressBar = require('progress')
const express = require('express')
const request = require('request')
const async = require('async')
const glob = require("glob")
const _ = require('lodash')
const fs = require('fs')
const app = express()

const config = require('./config')
const {env} = process

require('dotenv').load()

app.get('/callback', (req, res) => {

	// Get all JSON files
	glob(`${config.dir}/*.json`, {}, (er, files) => {
		let arr = []
		async.eachLimit(files, 10,
			function(item, callback) {
				fs.readFile(item, 'utf8', (err, data) => {
					if(err) throw err;
					let parsedJSON = JSON.parse(data);
					arr = arr.concat(parsedJSON)
					callback(null, arr)
				});
			},
			err => {
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
	let userId = null
	let trackId = null

	/* Auth flow */
	spotifyApi.authorizationCodeGrant(code)
		.then(data => {
			spotifyApi.setAccessToken(data.body['access_token'])
			spotifyApi.setRefreshToken(data.body['refresh_token'])
			console.log(data)
			return spotifyApi.getMe()
		})
		.then(userData => {
			userId = userData.body.id
			return spotifyApi.createPlaylist(userId, config.playlistName, {'public': false})
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
									console.log(`Verified: ${song.title}`)
									return spotifyApi.addTracksToPlaylist(userId, playlistId, [`spotify:track:${trackId}`])
								} else {
									return new Error(`Total sim too low: ${totalSim}`)
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
					}, 0)
				},
				// EACH Final
				err => {
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
			console.log('Outside error', e)
		})
}

/*
 Visit this route to generate a new playlist
 */
app.get('/', (req, res) => {
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
