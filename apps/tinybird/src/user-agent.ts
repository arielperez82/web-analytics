export const deviceSql = `case
                when is_bot = 1
                then 'bot'
                when match(user_agent, 'android')
                then 'mobile-android'
                when match(user_agent, 'ipad|iphone|ipod')
                then 'mobile-ios'
                else 'desktop'
            END`;

export const browserSql = `case
                when match(user_agent, 'firefox')
                then 'firefox'
                when match(user_agent, 'chrome|crios')
                then 'chrome'
                when match(user_agent, 'opera')
                then 'opera'
                when match(user_agent, 'msie|trident')
                then 'ie'
                when match(user_agent, 'iphone|ipad|safari')
                then 'safari'
                else 'Unknown'
            END`;
