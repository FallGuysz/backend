const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/', async (req, res) => {
    try {
        const nx = 83;
        const ny = 96;

        // 현재 시간에서 10분 전 시간 계산
        const now = new Date();
        now.setMinutes(now.getMinutes() - 10);

        const baseDate = now.toISOString().slice(0, 10).replace(/-/g, '');
        const baseTime = now.getHours().toString().padStart(2, '0') + '00';

        const serviceKey = '0Nf6t6Jssj2XfO591CDqb4/jytWcRqW7elLXQeIqrtZ/g1ipD0Bf/8RohFwsgBNeKZRpGqaOWHRxcjKl+0HqyQ==';

        const url = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst';
        const response = await axios.get(url, {
            params: {
                serviceKey,
                numOfRows: 100,
                pageNo: 1,
                dataType: 'JSON',
                base_date: baseDate,
                base_time: baseTime,
                nx,
                ny,
            },
        });

        const items = response.data.response.body.items.item;
        let temperature = null;
        let pty = null;

        items.forEach((item) => {
            if (item.category === 'T1H') {
                temperature = item.obsrValue;
            } else if (item.category === 'PTY') {
                pty = item.obsrValue;
            }
        });

        if (temperature && pty) {
            let weatherDesc;
            let icon;

            switch (pty) {
                case '0':
                    weatherDesc = '맑음';
                    icon = '☀️';
                    break;
                case '1':
                    weatherDesc = '비';
                    icon = '🌧️';
                    break;
                case '2':
                    weatherDesc = '비/눈';
                    icon = '🌨️';
                    break;
                case '3':
                    weatherDesc = '눈';
                    icon = '❄️';
                    break;
                case '4':
                    weatherDesc = '소나기';
                    icon = '🌦️';
                    break;
                default:
                    weatherDesc = '알 수 없음';
                    icon = '';
                    break;
            }

            res.json({
                code: 0,
                data: {
                    temperature: `${temperature}℃`,
                    weather: `${icon} ${weatherDesc}`,
                },
            });
        } else {
            throw new Error('날씨 정보를 찾을 수 없습니다.');
        }
    } catch (error) {
        console.error('날씨 정보 조회 실패:', error);
        res.status(500).json({
            code: 1,
            message: '날씨 정보를 가져오는데 실패했습니다.',
            error: error.message,
        });
    }
});

module.exports = router;
