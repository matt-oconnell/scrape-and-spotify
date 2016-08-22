# Scrape a website for Artist/Song names and upload them to a Spotify playlist
 
## Configuration

Copy the existing `.env.example` file to `.env`. Visit the Spotify developer page and create an app. Fill in the necessary credentials in the `.env` file. 

Then, adjust values in `config.js` accordingly.

- Run `node scrape.js` (This will write all the song/artist pairs to local json files)
- Run `node index.js`
- Visit `localhost:8081` in your browser. You need to authenticate using your spotify account. If you successfully log in, you will be redirected to a callback page. You can see the playlist upload progress in your terminal.

All the music is currently being pulled from `http://www.wfuv.org/`. This is an *awesome* non-profit station for Forham University.   

This project is experimental but I am considering abstracting it to work using different sources.
