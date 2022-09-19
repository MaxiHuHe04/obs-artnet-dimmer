import OBSWebSocket from "obs-websocket-js";
import {dmxnet} from "dmxnet";
import {config} from "./config.js";

const artNet = new dmxnet({sName: config.SHORT_NAME, lName: config.LONG_NAME})
const receiver = artNet.newReceiver({universe: config.UNIVERSE, net: config.NET, subnet: config.SUBNET})

const obs = new OBSWebSocket();
let tBarInvert = false;
let tBarLastPosition = 0;

async function createOpacityFilterIfMissing() {
    const {filters} = await obs.call("GetSourceFilterList", {sourceName: config.OBS_SOURCE_NAME});
    const opacityFilter = filters.find(value => value['filterName'] === config.OPACITY_FILTER_NAME);
    if (opacityFilter != null) {
        if (opacityFilter.filterKind !== 'color_filter_v2') {
            console.warn(`Filter '${opacityFilter.filterName}' has the wrong type (${opacityFilter.filterKind} instead of color_filter_v2)`)
        }
        return;
    }

    await obs.call('CreateSourceFilter', {
        sourceName: config.OBS_SOURCE_NAME,
        filterName: config.OPACITY_FILTER_NAME,
        filterKind: 'color_filter_v2'
    });
}

try {
    await obs.connect(config.OBS_WS_URL, config.OBS_PASSWORD).then(() => console.log('Connection to OBS successful'));
} catch (error) {
    console.error('Failed to connect to OBS:', error.code, error.message);
    process.exit(1);
}

try {
    await createOpacityFilterIfMissing();
} catch (error) {
    console.error(error);
    process.exit(1);
}

receiver.on('data', data => {
    if (data.length < config.CHANNEL + 1) return;
    const brightness = 1 - (data[config.CHANNEL] / 255) ** config.BRIGHTNESS_POWER;
    obs.call('SetSourceFilterSettings', {
        sourceName: config.OBS_SOURCE_NAME,
        filterName: config.OPACITY_FILTER_NAME,
        filterSettings: {opacity: brightness}
    }).catch(() => createOpacityFilterIfMissing())
        .catch(err => console.warn(err))

    if (config.TRANSITION_ENABLED && data.length >= config.CHANNEL + 2) {
        let transitionPosition = data[config.CHANNEL + 1] / 255;
        if (tBarLastPosition !== transitionPosition) {
            tBarLastPosition = transitionPosition;

            if (tBarInvert) transitionPosition = 1 - transitionPosition;
            if (transitionPosition >= 1) tBarInvert = !tBarInvert;
            obs.call('SetTBarPosition', {position: transitionPosition}).then();
        }
    }
});
