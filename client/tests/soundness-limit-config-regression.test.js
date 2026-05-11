import MoveSelector from '../src/algorithm/MoveSelector.js';
import FormController from '../src/ui/FormController.js';
import PgnProcessor from '../src/utils/PgnProcessor.js';

describe('Soundness/Move-loss config wiring regressions', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('MoveSelector preserves explicit zero limits', () => {
        const selector = new MoveSelector({
            CAREABOUTENGINE: 0,
            SOUNDNESSLIMIT: 0,
            LOSSLIMIT: 0
        });

        expect(selector.config.CAREABOUTENGINE).toBe(0);
        expect(selector.config.SOUNDNESSLIMIT).toBe(0);
        expect(selector.config.LOSSLIMIT).toBe(0);
    });

    test('FormController maps form ids to SOUNDNESSLIMIT/LOSSLIMIT and preserves 0', async () => {
        jest.spyOn(PgnProcessor, 'processPgn').mockResolvedValue({
            name: 'King Pawn Opening',
            moves: ['e4'],
            moveCount: 1,
            priority: 1
        });

        const controller = Object.create(FormController.prototype);
        controller.getSelectedSpeeds = jest.fn().mockReturnValue(['blitz']);
        controller.getSelectedRatings = jest.fn().mockReturnValue(['1800']);
        controller.convertGamesProbability = jest.fn().mockReturnValue(0.02);
        controller.convertPercentage = jest.fn().mockReturnValue(0.01);
        controller.convertConfidence = jest.fn().mockReturnValue(0.05);

        const config = await controller.convertToBookBuilderConfig({
            'pgn-input-text': '1. e4',
            'output-format': 'individual',
            'annotation-style': 'endBlock',
            'draws-half-point': true,
            'engine-enabled': true,
            'engine-full': false,
            'engine-depth': 20,
            'engine-finishing': 1,
            'soundness-limit': 0,
            'move-loss-limit': 0,
            'ignore-loss-limit': 300,
            'engine-hash': 320
        });

        expect(config.SOUNDNESSLIMIT).toBe(0);
        expect(config.LOSSLIMIT).toBe(0);
    });
});
