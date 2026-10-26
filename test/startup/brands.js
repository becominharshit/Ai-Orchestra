// 200 well-known Indian and global brands and famous people (TASK-18 acceptance: "no real company or person names").
// Kept separate from the generator's own blocklist (experiences/startup/lib/names.js) on purpose, so the test is independent.
export const BRANDS_200 = [
  // Indian apps, startups and brands (100)
  'Swiggy', 'Zomato', 'Zepto', 'Blinkit', 'BigBasket', 'JioMart', 'Dunzo', 'Flipkart', 'Myntra', 'Ajio', 'Meesho', 'Nykaa', 'Snapdeal', 'Lenskart', 'Mamaearth',
  'boAt', 'Paytm', 'PhonePe', 'Google Pay', 'BharatPe', 'MobiKwik', 'CRED', 'Groww', 'Zerodha', 'Upstox', 'Razorpay', 'PolicyBazaar', 'Ola', 'Uber', 'Rapido',
  'Yulu', 'redBus', 'MakeMyTrip', 'Goibibo', 'ixigo', 'OYO', 'Zostel', 'BYJUS', 'Unacademy', 'Vedantu', 'PhysicsWallah', 'Toppr', 'upGrad', 'Cuemath', 'Dream11',
  'MPL', 'WinZO', 'Cricbuzz', 'Hotstar', 'JioCinema', 'SonyLIV', 'ZEE5', 'MX Player', 'cult.fit', 'HealthifyMe', 'Practo', 'PharmEasy', 'Urban Company', 'NoBroker', 'MagicBricks',
  'ShareChat', 'Moj', 'Josh', 'Koo', 'Dailyhunt', 'Inshorts', 'Pocket FM', 'Gaana', 'JioSaavn', 'Apna', 'Naukri', 'Internshala', 'Dukaan', 'Khatabook', 'Udaan',
  'IndiaMART', 'Justdial', 'Faasos', 'Box8', 'Chaayos', 'Chai Point', 'Haldiram', 'Amul', 'Britannia', 'Parle', 'Dabur', 'Patanjali', 'Tata', 'Reliance', 'Jio',
  'Airtel', 'Infosys', 'Wipro', 'Mahindra', 'Bajaj', 'Maruti', 'Godrej', 'Titan', 'Tanishq', 'Asian Paints',
  // global brands (60)
  'Google', 'YouTube', 'Android', 'Apple', 'iPhone', 'Microsoft', 'Amazon', 'Alexa', 'Meta', 'Facebook', 'Instagram', 'WhatsApp', 'Twitter', 'TikTok', 'Snapchat',
  'Telegram', 'Discord', 'Reddit', 'LinkedIn', 'Pinterest', 'Spotify', 'Netflix', 'Disney', 'Samsung', 'Xiaomi', 'OnePlus', 'Vivo', 'Oppo', 'Nike', 'Adidas',
  'Puma', 'Decathlon', 'Zara', 'IKEA', 'Tesla', 'Starbucks', 'McDonalds', 'Dominos', 'KFC', 'Subway', 'Coca Cola', 'Pepsi', 'Nestle', 'Maggi', 'Cadbury',
  'Red Bull', 'OpenAI', 'ChatGPT', 'Nvidia', 'Intel', 'Adobe', 'Canva', 'Notion', 'Zoom', 'Duolingo', 'Coursera', 'Udemy', 'Airbnb', 'PayPal', 'Roblox',
  // famous people (40)
  'Virat Kohli', 'MS Dhoni', 'Sachin Tendulkar', 'Rohit Sharma', 'Jasprit Bumrah', 'Hardik Pandya', 'Shah Rukh Khan', 'Salman Khan', 'Aamir Khan', 'Amitabh Bachchan',
  'Akshay Kumar', 'Ranveer Singh', 'Deepika Padukone', 'Priyanka Chopra', 'Alia Bhatt', 'Narendra Modi', 'Mahatma Gandhi', 'Ratan Tata', 'Mukesh Ambani', 'Gautam Adani',
  'Elon Musk', 'Jeff Bezos', 'Bill Gates', 'Mark Zuckerberg', 'Sundar Pichai', 'Satya Nadella', 'Sam Altman', 'Taylor Swift', 'Lionel Messi', 'Cristiano Ronaldo',
  'Neeraj Chopra', 'PV Sindhu', 'Mary Kom', 'APJ Abdul Kalam', 'CarryMinati', 'Bhuvan Bam', 'Ashneer Grover', 'Aman Gupta', 'Anupam Mittal', 'Namita Thapar',
];

// Round 2 (CHECK-18 F1): an extra, independently written list of shows, creators, chains and apps teens know,
// plus the checker's finds. The test checks the WHOLE generated name space against BRANDS_200 + this + the
// generator's own list (experiences/startup/lib/brands.js).
export const BRANDS_EXTRA = [
  'Seekho', 'Gullak', 'Jambox', 'Bandbox', 'Riyaz', 'StepSetGo', 'Chaupal', 'MohallaTech', 'Sikka', 'CourseMate', 'RouteMate', 'Jar', 'Khyaal', 'AdmitHub', 'AdmitKard',
  'Kota Factory', 'Panchayat', 'Aspirants', 'TVF', 'Hostel Daze', 'Flames', 'Pitchers', 'Shark Tank', 'Mirzapur', 'Bigg Boss', 'Roadies', 'Splitsvilla', 'Taarak Mehta', 'Indian Idol', 'Chhota Bheem',
  'Motu Patlu', 'Doraemon', 'Shinchan', 'Pokemon', 'Naruto', 'Cocomelon', 'Ludo King', 'Candy Crush', 'Subway Surfers', 'Temple Run', 'Clash of Clans', 'Free Fire', 'BGMI', 'Valorant', 'Among Us',
  'Technical Guruji', 'Dhruv Rathee', 'BeerBiceps', 'Triggered Insaan', 'Techno Gamerz', 'Total Gaming', 'Ashish Chanchlani', 'Round2Hell', 'Slayy Point', 'MostlySane', 'Kusha Kapila', 'Prajakta Koli', 'S8UL', 'Filtercopy', 'ScoopWhoop',
  'DMart', 'Big Bazaar', 'Vishal Mega Mart', 'Croma', 'Reliance Digital', 'Vijay Sales', 'Haldirams', 'Bikanervala', 'Wow Momo', 'Burger Singh', 'Goli Vada Pav', 'Jumboking', 'Chai Sutta Bar', 'Third Wave', 'Blue Tokai',
  'Sleepy Owl', 'Paper Boat', 'Theobroma', 'Keventers', 'Barbeque Nation', 'Saravana Bhavan', 'Sagar Ratna', 'Uclean', 'Tumbledry', 'Zigly', 'Supertails', 'Wiggles', 'Ugaoo', 'Crossword', 'Bookswagon',
  'Pocket FM', 'Kuku FM', 'Smule', 'StarMaker', 'BandLab', 'Zupee', 'WinZO', 'Rooter', 'Loco', 'FanCode', 'Namma Yatri', 'Cityflo', 'Shuttl', 'Vogo', 'Zoomcar',
  'Scaler', 'Masai', 'Coding Ninjas', 'GeeksforGeeks', 'Great Learning', 'Allen', 'Aakash', 'FIITJEE', 'Unstop', 'CollegeDekho', 'Yocket', 'Leverage Edu', 'Brainly', 'Photomath', 'Chegg',
  'Jupiter', 'Fi Money', 'Niyo', 'Navi', 'Slice', 'OneCard', 'LazyPay', 'Simpl', 'INDmoney', 'Smallcase', 'Freecharge', 'Khatabook', 'OkCredit', 'Vyapar', 'Apna',
];
