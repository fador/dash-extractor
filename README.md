# DASH-extractor

Node.js software to fetch MPEG-DASH segments when given an MPD file location

 * Automatically selects audio+video with highest bitrate
 * Outputs temp/presentation_$Representation_ID$.m4v and temp/presentation_$Representation_ID$.m4a


Usage `node index.js http://url/to/file.mpd`

