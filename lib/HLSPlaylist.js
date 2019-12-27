
var HLSPlaylist = function HLSPlaylist() {

    var PLAYLIST_VERSION = 3;
    var MEDIA_SEQUENCE = 0;
    var PLAYLIST_TYPE = "VOD";

    // each duration, path
    function HLSPlaylist(fragments) {
        var m3u8Data = fragments.reduce(function(data, each){
            if(each.duration > data.targetDuration) {
                data.targetDuration = Math.ceil(each.duration);
            }
            data.m3u8Content.push("#EXTINF:"+each.duration+",");
            data.m3u8Content.push(each.path);

            return data;
        }, {
            m3u8Content: [],
            targetDuration: 0
        });

        var m3u8 = [];
        m3u8.push("#EXTM3U");
        m3u8.push("#EXT-X-VERSION:" + PLAYLIST_VERSION);
        m3u8.push("#EXT-X-MEDIA-SEQUENCE:" + MEDIA_SEQUENCE);
        m3u8.push("#EXT-X-TARGETDURATION:" + m3u8Data.targetDuration);
        m3u8.push("#EXT-X-PLAYLIST-TYPE:" + PLAYLIST_TYPE);
        m3u8 = m3u8.concat(m3u8Data.m3u8Content);
        m3u8.push("#EXT-X-ENDLIST");

        return m3u8.join('\n');
    }

    return HLSPlaylist;
}();

module.exports = HLSPlaylist;
