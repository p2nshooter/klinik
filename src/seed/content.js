// Default website + master content. Written to R2 on first boot, then fully editable in Admin.
const t = (id, en) => ({ id, en });

export const SEED = {
  settings: {
    clinic_name: 'Global Klinik',
    tagline: t('Layanan kesehatan terpadu, kelas dunia, dekat dengan Anda', 'Integrated, world-class healthcare close to you'),
    description: t(
      'Global Klinik adalah jaringan klinik modern dengan dokter umum, dokter gigi, dan dokter spesialis berpengalaman, didukung laboratorium, farmasi, dan layanan telemedicine.',
      'Global Klinik is a modern clinic network with experienced general practitioners, dentists and specialists, supported by laboratory, pharmacy and telemedicine services.'
    ),
    logo: '',
    phone: '(021) 5091 2345',
    whatsapp: '6285691234561',
    email: 'halo@globalklinik.id',
    address: 'Jl. Jenderal Sudirman Kav. 52, Senayan, Jakarta Selatan 12190',
    hours: t('Senin–Sabtu 07.00–21.00 · Minggu 08.00–14.00', 'Mon–Sat 7am–9pm · Sun 8am–2pm'),
    emergency: '119',
    instagram: 'https://instagram.com/',
    facebook: 'https://facebook.com/',
    youtube: 'https://youtube.com/',
    tiktok: '',
    sale_stamp_enabled: true,
    sale_stamp_text: 'WEBSITE INI DIJUAL',
    sale_stamp_phone: '+6285691234561',
    seo_title: t('Global Klinik — Klinik Modern, Dokter Spesialis & Booking Online', 'Global Klinik — Modern Clinic, Specialists & Online Booking'),
    seo_description: t(
      'Booking dokter online, cek jadwal dokter, layanan laboratorium, farmasi, dan telemedicine di Global Klinik. Cepat, aman, dan terpercaya.',
      'Book doctors online, check schedules, laboratory, pharmacy and telemedicine at Global Klinik. Fast, secure and trusted.'
    ),
    og_image: '',
    ga_id: '',
    nav: [
      { label: t('Layanan', 'Services'), href: '/layanan' },
      { label: t('Dokter', 'Doctors'), href: '/dokter' },
      { label: t('Jadwal', 'Schedule'), href: '/jadwal' },
      { label: t('Harga', 'Pricing'), href: '/harga' },
      { label: t('Promo', 'Promotions'), href: '/promo' },
      { label: t('Cabang', 'Branches'), href: '/cabang' },
      { label: t('Artikel', 'Articles'), href: '/blog' },
    ],
    footer_about: t(
      'Kesehatan Anda adalah prioritas kami. Dokter berpengalaman, teknologi modern, dan pelayanan yang hangat — di setiap cabang Global Klinik.',
      'Your health is our priority. Experienced doctors, modern technology and warm care — at every Global Klinik branch.'
    ),
    bank_accounts: [
      { bank: 'BCA', number: '123 456 7890', holder: 'PT Global Klinik Indonesia' },
      { bank: 'Mandiri', number: '123 00 0987654 3', holder: 'PT Global Klinik Indonesia' },
    ],
    qris_image: '',
    tax_percent: 0,
    admin_fee: 10000,
    invoice_note: 'Terima kasih atas kepercayaan Anda. Simpan dokumen ini sebagai bukti pembayaran yang sah.',
    booking_days_ahead: 30,
    booking_auto_confirm: true,
    reminder_hours: 24,
    points_per_10k: 1,
    wa_provider: 'none',
    email_from: '',
    satusehat_env: 'sandbox',
    satusehat_org_id: '',
    satusehat_enabled: false,
  },

  branches: [
    { id: 'jkt', name: 'Global Klinik Sudirman', slug: 'sudirman-jakarta', code: 'JKT', city: 'Jakarta Selatan', address: 'Jl. Jenderal Sudirman Kav. 52, Senayan, Jakarta Selatan 12190', phone: '(021) 5091 2345', whatsapp: '6285691234561', email: 'sudirman@globalklinik.id', hours: t('Senin–Sabtu 07.00–21.00 · Minggu 08.00–14.00', 'Mon–Sat 7am–9pm · Sun 8am–2pm'), maps_url: 'https://www.google.com/maps?q=-6.2253,106.8019&z=15&output=embed', lat: -6.2253, lng: 106.8019, image: '', is_main: true, active: true, order: 1 },
    { id: 'bdg', name: 'Global Klinik Dago', slug: 'dago-bandung', code: 'BDG', city: 'Bandung', address: 'Jl. Ir. H. Juanda No. 118, Dago, Bandung 40132', phone: '(022) 2501 888', whatsapp: '6285691234561', email: 'dago@globalklinik.id', hours: t('Senin–Sabtu 08.00–20.00', 'Mon–Sat 8am–8pm'), maps_url: 'https://www.google.com/maps?q=-6.8915,107.6107&z=15&output=embed', lat: -6.8915, lng: 107.6107, image: '', is_main: false, active: true, order: 2 },
    { id: 'sby', name: 'Global Klinik Darmo', slug: 'darmo-surabaya', code: 'SBY', city: 'Surabaya', address: 'Jl. Raya Darmo No. 90, Wonokromo, Surabaya 60241', phone: '(031) 5678 900', whatsapp: '6285691234561', email: 'darmo@globalklinik.id', hours: t('Senin–Sabtu 08.00–20.00', 'Mon–Sat 8am–8pm'), maps_url: 'https://www.google.com/maps?q=-7.2865,112.7378&z=15&output=embed', lat: -7.2865, lng: 112.7378, image: '', is_main: false, active: true, order: 3 },
  ],

  polis: [
    { id: 'umum', name: t('Poli Umum', 'General Practice'), code: 'A', icon: 'stethoscope', color: '#0F766E', description: t('Pemeriksaan kesehatan umum, konsultasi, dan penanganan keluhan sehari-hari.', 'General check-ups, consultations and everyday complaints.'), branches: ['jkt', 'bdg', 'sby'], active: true, order: 1 },
    { id: 'gigi', name: t('Poli Gigi', 'Dental Clinic'), code: 'B', icon: 'tooth', color: '#0369A1', description: t('Perawatan gigi lengkap: scaling, tambal, cabut, perawatan saluran akar, hingga estetika.', 'Complete dental care: scaling, fillings, extraction, root canal and aesthetics.'), branches: ['jkt', 'bdg', 'sby'], active: true, order: 2 },
    { id: 'anak', name: t('Poli Anak', 'Pediatrics'), code: 'C', icon: 'baby', color: '#B45309', description: t('Tumbuh kembang, imunisasi, dan kesehatan anak oleh dokter spesialis anak.', 'Growth, immunization and child health by pediatricians.'), branches: ['jkt', 'bdg'], active: true, order: 3 },
    { id: 'kia', name: t('Poli KIA & Kandungan', 'Maternal & OB-GYN'), code: 'D', icon: 'heart', color: '#BE185D', description: t('Kesehatan ibu hamil, USG, dan konsultasi kandungan.', 'Pregnancy care, ultrasound and gynecology.'), branches: ['jkt', 'sby'], active: true, order: 4 },
    { id: 'dalam', name: t('Poli Penyakit Dalam', 'Internal Medicine'), code: 'E', icon: 'activity', color: '#1D4ED8', description: t('Diabetes, hipertensi, kolesterol, dan penyakit kronis lainnya.', 'Diabetes, hypertension, cholesterol and other chronic diseases.'), branches: ['jkt', 'bdg', 'sby'], active: true, order: 5 },
    { id: 'kulit', name: t('Poli Kulit & Estetika', 'Dermatology & Aesthetics'), code: 'F', icon: 'sparkles', color: '#7C3AED', description: t('Perawatan kulit medis dan estetika oleh dokter spesialis kulit.', 'Medical and aesthetic skin care by dermatologists.'), branches: ['jkt'], active: true, order: 6 },
  ],

  services: [
    { id: 'svc-umum', name: t('Konsultasi Dokter Umum', 'General Practitioner Consultation'), slug: 'konsultasi-dokter-umum', poli_id: 'umum', icon: 'stethoscope', image: '', excerpt: t('Pemeriksaan dan konsultasi menyeluruh untuk keluhan kesehatan sehari-hari.', 'Thorough examination and consultation for everyday health complaints.'), content: t('## Apa yang Anda dapatkan\n\n- Anamnesis dan pemeriksaan fisik lengkap\n- Pengukuran tanda vital (tekanan darah, nadi, suhu, saturasi)\n- Diagnosis dan rencana terapi\n- Resep elektronik langsung ke farmasi\n- Rujukan ke dokter spesialis bila diperlukan\n\n## Cocok untuk\n\nDemam, batuk pilek, sakit kepala, gangguan pencernaan, pemeriksaan surat sehat, dan konsultasi kesehatan umum.', '## What you get\n\n- Complete history taking and physical examination\n- Vital signs measurement\n- Diagnosis and treatment plan\n- E-prescription sent to our pharmacy\n- Specialist referral when needed\n\n## Suitable for\n\nFever, flu, headaches, digestive problems, medical certificates and general consultations.'), price: 150000, price_note: t('belum termasuk obat', 'excluding medication'), duration: 20, branch_prices: [{ branch_id: 'bdg', price: 125000 }, { branch_id: 'sby', price: 125000 }], branches: ['jkt', 'bdg', 'sby'], telemedicine: true, featured: true, active: true, order: 1 },
    { id: 'svc-gigi', name: t('Perawatan Gigi & Scaling', 'Dental Care & Scaling'), slug: 'perawatan-gigi', poli_id: 'gigi', icon: 'tooth', image: '', excerpt: t('Scaling, tambal estetik, cabut gigi, dan perawatan saluran akar dengan alat modern.', 'Scaling, aesthetic fillings, extractions and root canal treatment with modern equipment.'), content: t('## Layanan gigi\n\n- Scaling & polishing\n- Tambal gigi estetik (komposit)\n- Cabut gigi & odontektomi\n- Perawatan saluran akar\n- Konsultasi behel & veneer\n\nSemua tindakan menggunakan alat steril sekali pakai dan sterilisasi autoklaf.', '## Dental services\n\n- Scaling & polishing\n- Aesthetic composite fillings\n- Extractions & odontectomy\n- Root canal treatment\n- Braces & veneer consultation\n\nAll procedures use single-use sterile tools and autoclave sterilization.'), price: 350000, price_note: t('scaling mulai', 'scaling from'), duration: 45, branch_prices: [], branches: ['jkt', 'bdg', 'sby'], telemedicine: false, featured: true, active: true, order: 2 },
    { id: 'svc-anak', name: t('Dokter Anak & Imunisasi', 'Pediatrics & Immunization'), slug: 'dokter-anak-imunisasi', poli_id: 'anak', icon: 'baby', image: '', excerpt: t('Pantau tumbuh kembang si kecil dan lengkapi imunisasi sesuai jadwal IDAI.', 'Monitor your child\'s growth and complete immunizations on schedule.'), content: t('## Layanan anak\n\n- Konsultasi dokter spesialis anak\n- Imunisasi dasar & lanjutan (jadwal IDAI)\n- Pemantauan tumbuh kembang\n- Konsultasi gizi & MPASI\n\nRuang tunggu ramah anak dan area menyusui tersedia.', '## Pediatric services\n\n- Pediatrician consultation\n- Basic & booster immunizations\n- Growth & development monitoring\n- Nutrition consultation\n\nChild-friendly waiting room and nursing area available.'), price: 250000, price_note: t('konsultasi spesialis', 'specialist consultation'), duration: 20, branch_prices: [], branches: ['jkt', 'bdg'], telemedicine: true, featured: true, active: true, order: 3 },
    { id: 'svc-kia', name: t('Kehamilan & USG', 'Pregnancy Care & Ultrasound'), slug: 'kehamilan-usg', poli_id: 'kia', icon: 'heart', image: '', excerpt: t('Pemeriksaan kehamilan rutin dan USG 4D bersama dokter kandungan.', 'Routine prenatal check-ups and 4D ultrasound with obstetricians.'), content: t('## Layanan KIA\n\n- Antenatal care (ANC) terpadu\n- USG 2D & 4D\n- Konsultasi program hamil\n- Senam hamil & kelas laktasi', '## Maternal services\n\n- Integrated antenatal care\n- 2D & 4D ultrasound\n- Pregnancy planning consultation\n- Prenatal exercise & lactation classes'), price: 400000, price_note: t('termasuk USG 2D', 'includes 2D ultrasound'), duration: 30, branch_prices: [], branches: ['jkt', 'sby'], telemedicine: false, featured: true, active: true, order: 4 },
    { id: 'svc-dalam', name: t('Penyakit Dalam & Kronis', 'Internal Medicine & Chronic Care'), slug: 'penyakit-dalam', poli_id: 'dalam', icon: 'activity', image: '', excerpt: t('Pengelolaan diabetes, hipertensi, kolesterol, dan asam urat secara berkelanjutan.', 'Continuous management of diabetes, hypertension, cholesterol and gout.'), content: t('## Program penyakit kronis\n\n- Konsultasi spesialis penyakit dalam\n- Kontrol gula darah & HbA1c\n- Edukasi gaya hidup & diet\n- Pengingat kontrol otomatis via WhatsApp', '## Chronic care program\n\n- Internist consultation\n- Blood sugar & HbA1c control\n- Lifestyle & diet education\n- Automatic follow-up reminders via WhatsApp'), price: 300000, price_note: t('konsultasi spesialis', 'specialist consultation'), duration: 25, branch_prices: [], branches: ['jkt', 'bdg', 'sby'], telemedicine: true, featured: true, active: true, order: 5 },
    { id: 'svc-kulit', name: t('Kulit & Estetika Medis', 'Dermatology & Medical Aesthetics'), slug: 'kulit-estetika', poli_id: 'kulit', icon: 'sparkles', image: '', excerpt: t('Jerawat, flek, dan peremajaan kulit dengan pendekatan medis yang aman.', 'Acne, pigmentation and skin rejuvenation with a safe medical approach.'), content: t('## Perawatan kulit\n\n- Konsultasi dokter spesialis kulit\n- Chemical peeling\n- Terapi jerawat & bekas jerawat\n- Skin booster', '## Skin treatments\n\n- Dermatologist consultation\n- Chemical peeling\n- Acne & acne scar therapy\n- Skin booster'), price: 300000, price_note: t('konsultasi', 'consultation'), duration: 30, branch_prices: [], branches: ['jkt'], telemedicine: true, featured: true, active: true, order: 6 },
    { id: 'svc-lab', name: t('Laboratorium Klinik', 'Clinical Laboratory'), slug: 'laboratorium', poli_id: 'umum', icon: 'flask', image: '', excerpt: t('Cek darah lengkap, gula darah, kolesterol, fungsi hati & ginjal — hasil bisa diunduh online.', 'Complete blood count, glucose, cholesterol, liver & kidney function — download results online.'), content: t('## Pemeriksaan tersedia\n\n- Hematologi lengkap\n- Kimia klinik (gula, lipid, fungsi hati, fungsi ginjal)\n- Urinalisis\n- Serologi\n\nHasil tersedia di portal pasien dan dapat diunduh dalam format PDF.', '## Available tests\n\n- Complete hematology\n- Clinical chemistry (glucose, lipids, liver and kidney function)\n- Urinalysis\n- Serology\n\nResults are available in the patient portal as downloadable PDFs.'), price: 85000, price_note: t('mulai dari', 'from'), duration: 15, branch_prices: [], branches: ['jkt', 'bdg', 'sby'], telemedicine: false, featured: false, active: true, order: 7 },
    { id: 'svc-tele', name: t('Telemedicine (Konsultasi Video)', 'Telemedicine (Video Consultation)'), slug: 'telemedicine', poli_id: 'umum', icon: 'video', image: '', excerpt: t('Konsultasi dokter dari rumah via video call aman, resep dikirim ke farmasi kami.', 'Consult a doctor from home via secure video call; prescriptions sent to our pharmacy.'), content: t('## Cara kerja\n\n1. Pilih dokter & jadwal di halaman booking, pilih **Telemedicine**\n2. Link video dikirim otomatis setelah booking\n3. Konsultasi, lalu resep dapat diambil di cabang terdekat', '## How it works\n\n1. Choose a doctor & time on the booking page, select **Telemedicine**\n2. A video link is sent automatically after booking\n3. Consult, then pick up your prescription at the nearest branch'), price: 100000, price_note: t('per sesi', 'per session'), duration: 20, branch_prices: [], branches: ['jkt', 'bdg', 'sby'], telemedicine: true, featured: true, active: true, order: 8 },
  ],

  doctors: [
    { id: 'dr-andini', name: 'dr. Andini Pratama', slug: 'dr-andini-pratama', specialty: t('Dokter Umum', 'General Practitioner'), poli_id: 'umum', branches: ['jkt'], photo: '', bio: t('Dokter umum dengan fokus pada kedokteran keluarga dan pencegahan penyakit. Dikenal ramah dan komunikatif.', 'General practitioner focused on family medicine and prevention. Known for her warm, clear communication.'), education: t('S1 Kedokteran — Universitas Indonesia\nSertifikasi Kedokteran Keluarga', 'MD — Universitas Indonesia\nFamily Medicine Certification'), experience_years: 9, languages: 'Indonesia, English', str_no: 'STR-3171-0001', sip_no: 'SIP-JKT-0001', nik: '', consult_fee: 150000, telemedicine: true, rating: 4.9, featured: true, active: true, order: 1 },
    { id: 'dr-rizky', name: 'drg. Rizky Mahendra, Sp.KG', slug: 'drg-rizky-mahendra', specialty: t('Spesialis Konservasi Gigi', 'Conservative Dentistry Specialist'), poli_id: 'gigi', branches: ['jkt', 'bdg'], photo: '', bio: t('Spesialis perawatan saluran akar dan restorasi estetik dengan pendekatan minim rasa sakit.', 'Specialist in root canal therapy and aesthetic restorations with a pain-minimizing approach.'), education: t('Dokter Gigi — Universitas Padjadjaran\nSpesialis Konservasi Gigi — Universitas Indonesia', 'DDS — Universitas Padjadjaran\nConservative Dentistry — Universitas Indonesia'), experience_years: 12, languages: 'Indonesia, English', str_no: 'STR-3273-0002', sip_no: 'SIP-JKT-0002', nik: '', consult_fee: 250000, telemedicine: false, rating: 4.9, featured: true, active: true, order: 2 },
    { id: 'dr-sekar', name: 'dr. Sekar Ayuningtyas, Sp.A', slug: 'dr-sekar-ayuningtyas', specialty: t('Spesialis Anak', 'Pediatrician'), poli_id: 'anak', branches: ['jkt', 'bdg'], photo: '', bio: t('Dokter spesialis anak yang berpengalaman menangani tumbuh kembang, alergi, dan imunisasi.', 'Pediatrician experienced in growth & development, allergies and immunization.'), education: t('S1 Kedokteran — Universitas Gadjah Mada\nSpesialis Anak — Universitas Indonesia', 'MD — Universitas Gadjah Mada\nPediatrics — Universitas Indonesia'), experience_years: 11, languages: 'Indonesia, English, Jawa', str_no: 'STR-3171-0003', sip_no: 'SIP-JKT-0003', nik: '', consult_fee: 250000, telemedicine: true, rating: 5, featured: true, active: true, order: 3 },
    { id: 'dr-hendra', name: 'dr. Hendra Wijaya, Sp.PD', slug: 'dr-hendra-wijaya', specialty: t('Spesialis Penyakit Dalam', 'Internist'), poli_id: 'dalam', branches: ['jkt', 'sby'], photo: '', bio: t('Berpengalaman dalam penanganan diabetes, hipertensi, dan penyakit metabolik.', 'Experienced in managing diabetes, hypertension and metabolic diseases.'), education: t('S1 Kedokteran — Universitas Airlangga\nSpesialis Penyakit Dalam — Universitas Airlangga', 'MD — Universitas Airlangga\nInternal Medicine — Universitas Airlangga'), experience_years: 15, languages: 'Indonesia, English, Mandarin', str_no: 'STR-3578-0004', sip_no: 'SIP-JKT-0004', nik: '', consult_fee: 300000, telemedicine: true, rating: 4.8, featured: true, active: true, order: 4 },
    { id: 'dr-maya', name: 'dr. Maya Kartika, Sp.OG', slug: 'dr-maya-kartika', specialty: t('Spesialis Kandungan', 'Obstetrician & Gynecologist'), poli_id: 'kia', branches: ['jkt', 'sby'], photo: '', bio: t('Mendampingi ibu dari program hamil hingga persalinan dengan pendekatan yang tenang dan suportif.', 'Supporting mothers from pregnancy planning to delivery with a calm, supportive approach.'), education: t('S1 Kedokteran — Universitas Diponegoro\nSpesialis Obstetri & Ginekologi — Universitas Indonesia', 'MD — Universitas Diponegoro\nOB-GYN — Universitas Indonesia'), experience_years: 13, languages: 'Indonesia, English', str_no: 'STR-3171-0005', sip_no: 'SIP-JKT-0005', nik: '', consult_fee: 350000, telemedicine: false, rating: 4.9, featured: true, active: true, order: 5 },
    { id: 'dr-nadia', name: 'dr. Nadia Putri, Sp.DVE', slug: 'dr-nadia-putri', specialty: t('Spesialis Kulit & Kelamin', 'Dermatologist'), poli_id: 'kulit', branches: ['jkt'], photo: '', bio: t('Fokus pada dermatologi estetik dan terapi jerawat berbasis bukti ilmiah.', 'Focused on aesthetic dermatology and evidence-based acne therapy.'), education: t('S1 Kedokteran — Universitas Indonesia\nSpesialis Dermatologi & Venereologi — Universitas Indonesia', 'MD — Universitas Indonesia\nDermatology & Venereology — Universitas Indonesia'), experience_years: 8, languages: 'Indonesia, English', str_no: 'STR-3171-0006', sip_no: 'SIP-JKT-0006', nik: '', consult_fee: 300000, telemedicine: true, rating: 4.9, featured: true, active: true, order: 6 },
    { id: 'dr-bayu', name: 'dr. Bayu Saputra', slug: 'dr-bayu-saputra', specialty: t('Dokter Umum', 'General Practitioner'), poli_id: 'umum', branches: ['bdg'], photo: '', bio: t('Dokter umum yang berpengalaman di layanan gawat darurat dan kedokteran olahraga.', 'General practitioner experienced in emergency care and sports medicine.'), education: t('S1 Kedokteran — Universitas Padjadjaran', 'MD — Universitas Padjadjaran'), experience_years: 7, languages: 'Indonesia, English, Sunda', str_no: 'STR-3273-0007', sip_no: 'SIP-BDG-0007', nik: '', consult_fee: 125000, telemedicine: true, rating: 4.8, featured: false, active: true, order: 7 },
    { id: 'dr-larasati', name: 'dr. Larasati Dewi', slug: 'dr-larasati-dewi', specialty: t('Dokter Umum', 'General Practitioner'), poli_id: 'umum', branches: ['sby'], photo: '', bio: t('Dokter umum dengan minat pada kesehatan wanita dan gizi klinik.', 'General practitioner with an interest in women\'s health and clinical nutrition.'), education: t('S1 Kedokteran — Universitas Airlangga', 'MD — Universitas Airlangga'), experience_years: 6, languages: 'Indonesia, English, Jawa', str_no: 'STR-3578-0008', sip_no: 'SIP-SBY-0008', nik: '', consult_fee: 125000, telemedicine: true, rating: 4.8, featured: false, active: true, order: 8 },
  ],

  schedules: [],

  facilities: [
    { id: 'fac-lab', name: t('Laboratorium Terintegrasi', 'Integrated Laboratory'), description: t('Hasil cepat, tervalidasi, dan dapat diunduh dari portal pasien.', 'Fast, validated results downloadable from the patient portal.'), icon: 'flask', image: '', branches: ['jkt', 'bdg', 'sby'], order: 1, active: true },
    { id: 'fac-farmasi', name: t('Farmasi 24 Jam', '24-Hour Pharmacy'), description: t('Obat lengkap dengan resep elektronik langsung dari dokter.', 'Complete medicines with e-prescriptions straight from your doctor.'), icon: 'pill', image: '', branches: ['jkt'], order: 2, active: true },
    { id: 'fac-usg', name: t('USG 4D', '4D Ultrasound'), description: t('Pencitraan detail untuk pemeriksaan kehamilan dan abdomen.', 'Detailed imaging for pregnancy and abdominal examinations.'), icon: 'monitor', image: '', branches: ['jkt', 'sby'], order: 3, active: true },
    { id: 'fac-dental', name: t('Dental Unit Modern', 'Modern Dental Units'), description: t('Kursi gigi ergonomis dan sterilisasi autoklaf kelas B.', 'Ergonomic dental chairs and class B autoclave sterilization.'), icon: 'tooth', image: '', branches: ['jkt', 'bdg', 'sby'], order: 4, active: true },
    { id: 'fac-kids', name: t('Ruang Tunggu Ramah Anak', 'Kid-Friendly Waiting Area'), description: t('Area bermain aman dan ruang laktasi yang nyaman.', 'Safe play area and a comfortable nursing room.'), icon: 'baby', image: '', branches: ['jkt', 'bdg'], order: 5, active: true },
    { id: 'fac-queue', name: t('Antrian Digital', 'Digital Queue'), description: t('Pantau nomor antrian dari HP, tanpa menunggu lama di klinik.', 'Track your queue number from your phone — no long waits.'), icon: 'ticket', image: '', branches: ['jkt', 'bdg', 'sby'], order: 6, active: true },
  ],

  pricing: [
    { id: 'pk-basic', name: t('Medical Check-up Basic', 'Basic Medical Check-up'), description: t('Pemeriksaan dasar tahunan untuk usia produktif.', 'Essential annual screening for adults.'), price: 450000, price_old: 600000, features: t('Konsultasi dokter umum\nPemeriksaan fisik lengkap\nDarah rutin\nGula darah puasa\nKolesterol total\nUrinalisis', 'GP consultation\nComplete physical exam\nComplete blood count\nFasting blood glucose\nTotal cholesterol\nUrinalysis'), service_id: 'svc-lab', highlight: false, order: 1, active: true },
    { id: 'pk-exec', name: t('Medical Check-up Executive', 'Executive Medical Check-up'), description: t('Paket terlengkap untuk profesional sibuk.', 'Comprehensive package for busy professionals.'), price: 1250000, price_old: 1650000, features: t('Konsultasi spesialis penyakit dalam\nProfil lipid lengkap\nFungsi hati & ginjal\nHbA1c\nEKG\nRingkasan hasil digital', 'Internist consultation\nFull lipid profile\nLiver & kidney function\nHbA1c\nECG\nDigital results summary'), service_id: 'svc-dalam', highlight: true, order: 2, active: true },
    { id: 'pk-family', name: t('Paket Keluarga Sehat', 'Healthy Family Package'), description: t('Satu paket untuk 4 anggota keluarga.', 'One package for a family of 4.'), price: 1500000, price_old: 2000000, features: t('4x konsultasi dokter umum\n2x konsultasi dokter anak\nScaling gigi 2 orang\nMember Gold 1 tahun', '4 GP consultations\n2 pediatric consultations\nDental scaling for 2\n1-year Gold membership'), service_id: 'svc-umum', highlight: false, order: 3, active: true },
  ],

  promotions: [
    { id: 'promo-mcu', title: t('Diskon 25% Medical Check-up', '25% Off Medical Check-up'), slug: 'diskon-medical-check-up', excerpt: t('Jaga kesehatan sejak dini. Berlaku untuk semua paket MCU di seluruh cabang.', 'Stay ahead of your health. Valid for all check-up packages at every branch.'), content: t('Gunakan kode **SEHAT25** saat booking online.\n\n- Berlaku hingga akhir bulan\n- Tidak dapat digabung dengan promo lain\n- Berlaku di semua cabang', 'Use code **SEHAT25** when booking online.\n\n- Valid until the end of the month\n- Cannot be combined with other promotions\n- Valid at all branches'), image: '', badge: t('-25%', '-25%'), coupon_code: 'SEHAT25', start_date: '2026-01-01', end_date: '2027-12-31', active: true },
    { id: 'promo-gigi', title: t('Scaling Gigi Hemat', 'Dental Scaling Deal'), slug: 'scaling-gigi-hemat', excerpt: t('Senyum lebih sehat dengan harga spesial setiap hari Selasa & Rabu.', 'A healthier smile at a special price every Tuesday & Wednesday.'), content: t('Scaling + polishing hanya **Rp 249.000** setiap Selasa & Rabu. Kode: **GIGI249**.', 'Scaling + polishing for only **Rp 249,000** every Tuesday & Wednesday. Code: **GIGI249**.'), image: '', badge: t('Rp 249rb', 'Rp 249k'), coupon_code: 'GIGI249', start_date: '2026-01-01', end_date: '2027-12-31', active: true },
    { id: 'promo-tele', title: t('Telemedicine Pertama Gratis', 'First Telemedicine Free'), slug: 'telemedicine-gratis', excerpt: t('Coba konsultasi video pertama Anda tanpa biaya.', 'Try your first video consultation for free.'), content: t('Khusus pengguna baru portal pasien. Kode: **TELEFREE**.', 'For new patient-portal users only. Code: **TELEFREE**.'), image: '', badge: t('GRATIS', 'FREE'), coupon_code: 'TELEFREE', start_date: '2026-01-01', end_date: '2027-12-31', active: true },
  ],

  testimonials: [
    { id: 'tst-1', name: 'Rina S.', caption: t('Pasien Poli Anak', 'Pediatrics patient'), rating: 5, content: t('Booking online sangat mudah, dokternya sabar sekali menjelaskan ke anak saya. Antrian bisa dipantau dari HP!', 'Online booking is so easy, and the doctor was very patient with my child. I could track the queue from my phone!'), photo: '', status: 'published', date: '2026-08-12' },
    { id: 'tst-2', name: 'Budi H.', caption: t('Program Diabetes', 'Diabetes program'), rating: 5, content: t('Pengingat kontrol lewat WhatsApp membantu saya disiplin. Hasil lab bisa diunduh, praktis.', 'The WhatsApp check-up reminders keep me disciplined. Downloadable lab results are so convenient.'), photo: '', status: 'published', date: '2026-07-30' },
    { id: 'tst-3', name: 'Claudia M.', caption: t('Pasien Gigi', 'Dental patient'), rating: 5, content: t('Kliniknya bersih dan modern. Perawatan saluran akar tanpa sakit, harga transparan sejak awal.', 'Clean, modern clinic. Painless root canal and transparent pricing from the start.'), photo: '', status: 'published', date: '2026-08-02' },
    { id: 'tst-4', name: 'Arif W.', caption: t('Medical Check-up Korporat', 'Corporate check-up'), rating: 5, content: t('Kami memakai Global Klinik untuk MCU 120 karyawan. Laporan rapi dan tepat waktu.', 'We used Global Klinik for 120 employee check-ups. Neat, on-time reports.'), photo: '', status: 'published', date: '2026-06-18' },
    { id: 'tst-5', name: 'Dewi L.', caption: t('Pasien Kandungan', 'OB-GYN patient'), rating: 5, content: t('dr. Maya sangat menenangkan. USG 4D-nya jernih sekali, pengalaman yang berkesan.', 'Dr. Maya is so reassuring. The 4D ultrasound was crystal clear — a memorable experience.'), photo: '', status: 'published', date: '2026-05-21' },
    { id: 'tst-6', name: 'Kevin T.', caption: t('Telemedicine', 'Telemedicine'), rating: 5, content: t('Konsultasi video lancar, resep langsung bisa diambil di cabang. Hemat waktu!', 'Smooth video consult and the prescription was ready at the branch. Such a time saver!'), photo: '', status: 'published', date: '2026-09-01' },
  ],

  posts: [
    { id: 'post-1', title: t('7 Tanda Anda Perlu Medical Check-up Sekarang', '7 Signs You Need a Medical Check-up Now'), slug: 'tanda-perlu-medical-check-up', category: 'Pencegahan', tags: ['mcu', 'pencegahan'], cover: '', excerpt: t('Mudah lelah, sering haus, atau sakit kepala berulang? Bisa jadi tubuh Anda memberi sinyal.', 'Always tired, constantly thirsty or recurring headaches? Your body may be sending signals.'), content: t('Banyak penyakit kronis berkembang tanpa gejala berarti. Pemeriksaan rutin membantu mendeteksinya lebih awal.\n\n## Tanda yang perlu diwaspadai\n\n1. Mudah lelah meski cukup tidur\n2. Sering haus dan buang air kecil\n3. Sakit kepala berulang\n4. Berat badan berubah drastis\n5. Sesak saat aktivitas ringan\n6. Riwayat keluarga diabetes atau jantung\n7. Usia di atas 35 tahun dan belum pernah MCU\n\n> Deteksi dini jauh lebih murah dan efektif dibanding pengobatan saat penyakit sudah lanjut.\n\nBooking paket MCU di Global Klinik dan dapatkan hasil digital yang bisa diunduh kapan saja.', 'Many chronic diseases develop silently. Regular check-ups help detect them early.\n\n## Warning signs\n\n1. Fatigue despite enough sleep\n2. Frequent thirst and urination\n3. Recurring headaches\n4. Drastic weight changes\n5. Shortness of breath on light activity\n6. Family history of diabetes or heart disease\n7. Over 35 and never had a check-up\n\n> Early detection is far cheaper and more effective than late treatment.\n\nBook a check-up package at Global Klinik and get downloadable digital results.'), author: 'dr. Andini Pratama', published_at: '2026-09-10', status: 'published' },
    { id: 'post-2', title: t('Panduan Imunisasi Anak Lengkap 2026', 'Complete Child Immunization Guide 2026'), slug: 'panduan-imunisasi-anak', category: 'Anak', tags: ['anak', 'imunisasi'], cover: '', excerpt: t('Jadwal imunisasi dasar dan lanjutan yang wajib diketahui orang tua.', 'Basic and booster immunization schedules every parent should know.'), content: t('Imunisasi melindungi anak dari penyakit berbahaya yang dapat dicegah.\n\n## Imunisasi dasar\n\n- **Hepatitis B** — saat lahir\n- **BCG & Polio 1** — usia 1 bulan\n- **DPT-HB-Hib & Polio** — usia 2, 3, 4 bulan\n- **Campak/MR** — usia 9 bulan\n\n## Tips\n\nSimpan catatan imunisasi di portal pasien Global Klinik agar jadwal berikutnya diingatkan otomatis.', 'Immunization protects children from dangerous, preventable diseases.\n\n## Basic immunization\n\n- **Hepatitis B** — at birth\n- **BCG & Polio 1** — 1 month\n- **DPT-HB-Hib & Polio** — 2, 3, 4 months\n- **Measles/MR** — 9 months\n\n## Tip\n\nKeep immunization records in the Global Klinik patient portal to get automatic reminders.'), author: 'dr. Sekar Ayuningtyas, Sp.A', published_at: '2026-08-28', status: 'published' },
    { id: 'post-3', title: t('Menjaga Gula Darah Tetap Stabil', 'Keeping Blood Sugar Stable'), slug: 'menjaga-gula-darah-stabil', category: 'Penyakit Kronis', tags: ['diabetes'], cover: '', excerpt: t('Langkah sederhana harian untuk penyandang diabetes dan pradiabetes.', 'Simple daily steps for people with diabetes and prediabetes.'), content: t('## Kebiasaan penting\n\n- Makan teratur dengan porsi seimbang\n- Batasi gula dan karbohidrat olahan\n- Aktivitas fisik 150 menit per minggu\n- Cek gula darah dan HbA1c secara berkala\n- Minum obat sesuai anjuran dokter', '## Key habits\n\n- Regular, balanced meals\n- Limit sugar and refined carbs\n- 150 minutes of activity per week\n- Check blood glucose and HbA1c regularly\n- Take medication as prescribed'), author: 'dr. Hendra Wijaya, Sp.PD', published_at: '2026-08-15', status: 'published' },
    { id: 'post-4', title: t('Kapan Harus ke Dokter Gigi?', 'When Should You See a Dentist?'), slug: 'kapan-ke-dokter-gigi', category: 'Gigi', tags: ['gigi'], cover: '', excerpt: t('Idealnya setiap 6 bulan — tapi ada kondisi yang tidak boleh ditunda.', 'Ideally every 6 months — but some conditions should not wait.'), content: t('Kontrol gigi rutin setiap 6 bulan mencegah karies dan penyakit gusi.\n\n## Jangan tunda bila\n\n- Gusi berdarah terus-menerus\n- Gigi ngilu saat minum dingin\n- Bengkak pada pipi atau gusi\n- Bau mulut yang menetap', 'Routine dental visits every 6 months prevent cavities and gum disease.\n\n## Don\'t wait if\n\n- Your gums keep bleeding\n- Teeth hurt with cold drinks\n- Swelling of the cheek or gums\n- Persistent bad breath'), author: 'drg. Rizky Mahendra, Sp.KG', published_at: '2026-07-20', status: 'published' },
  ],

  faqs: [
    { id: 'faq-1', question: t('Bagaimana cara booking dokter secara online?', 'How do I book a doctor online?'), answer: t('Klik **Booking** di menu, pilih cabang, layanan, dokter, tanggal, dan jam yang tersedia, lalu isi data pasien. Nomor booking langsung dikirim dan dapat dicek kapan saja.', 'Click **Booking**, choose a branch, service, doctor, date and available time, then fill in patient details. Your booking number is issued instantly.'), category: 'Booking', order: 1, active: true },
    { id: 'faq-2', question: t('Apakah bisa reschedule atau membatalkan booking?', 'Can I reschedule or cancel?'), answer: t('Bisa. Buka **Cek Booking**, masukkan nomor booking dan nomor HP, lalu pilih jadwal baru atau batalkan.', 'Yes. Open **Check Booking**, enter your booking number and phone, then pick a new time or cancel.'), category: 'Booking', order: 2, active: true },
    { id: 'faq-3', question: t('Apakah menerima BPJS dan asuransi?', 'Do you accept BPJS and insurance?'), answer: t('Kami menerima BPJS Kesehatan (sesuai cabang) dan berbagai asuransi rekanan. Bawa kartu peserta saat berkunjung.', 'We accept BPJS (branch-dependent) and partner insurers. Please bring your member card.'), category: 'Pembayaran', order: 3, active: true },
    { id: 'faq-4', question: t('Metode pembayaran apa saja yang tersedia?', 'Which payment methods are available?'), answer: t('Tunai, transfer bank, QRIS, e-wallet, virtual account, serta kartu debit/kredit.', 'Cash, bank transfer, QRIS, e-wallets, virtual accounts and debit/credit cards.'), category: 'Pembayaran', order: 4, active: true },
    { id: 'faq-5', question: t('Bagaimana cara mengunduh hasil lab dan invoice?', 'How can I download lab results and invoices?'), answer: t('Login ke **Portal Pasien**. Semua hasil lab, resep, invoice, dan kwitansi tersedia dalam format PDF.', 'Log in to the **Patient Portal**. All lab results, prescriptions, invoices and receipts are available as PDFs.'), category: 'Portal', order: 5, active: true },
    { id: 'faq-6', question: t('Apakah data medis saya aman?', 'Is my medical data secure?'), answer: t('Ya. Data dienkripsi saat dikirim, akses dibatasi sesuai peran, dan setiap akses tercatat di audit log.', 'Yes. Data is encrypted in transit, access is role-restricted, and every access is audit-logged.'), category: 'Keamanan', order: 6, active: true },
    { id: 'faq-7', question: t('Bagaimana telemedicine bekerja?', 'How does telemedicine work?'), answer: t('Pilih jenis **Telemedicine** saat booking. Link video aman dikirim otomatis, cukup buka di HP atau laptop pada jam yang dipilih.', 'Choose **Telemedicine** when booking. A secure video link is sent automatically — just open it at your appointment time.'), category: 'Layanan', order: 7, active: true },
    { id: 'faq-8', question: t('Bisakah website ini dipasang sebagai aplikasi?', 'Can I install this website as an app?'), answer: t('Bisa! Di HP pilih **Tambahkan ke layar utama**, di laptop klik ikon install pada address bar.', 'Yes! On mobile choose **Add to Home Screen**; on desktop click the install icon in the address bar.'), category: 'Portal', order: 8, active: true },
  ],

  banners: [
    { id: 'bn-1', title: t('Booking dokter tanpa antre', 'Book doctors without queuing'), subtitle: t('Pilih jadwal, datang tepat waktu, pantau antrian dari HP.', 'Pick a time, arrive on schedule, track the queue from your phone.'), image: '', cta_label: t('Booking sekarang', 'Book now'), cta_href: '/booking', position: 'home_strip', start_date: '', end_date: '', order: 1, active: true },
  ],

  pages: [
    {
      id: 'page-home', title: t('Beranda', 'Home'), slug: 'home', status: 'published', seo_description: t('', ''),
      blocks: [
        { type: 'hero', eyebrow: t('Klinik Modern · 3 Cabang · Booking Online', 'Modern Clinic · 3 Branches · Online Booking'), title: t('Perawatan kelas dunia, *dengan sentuhan yang hangat.*', 'World-class care, *with a warm touch.*'), text: t('Dokter umum, dokter gigi, dan spesialis berpengalaman — didukung laboratorium, farmasi, dan telemedicine. Booking dalam 60 detik.', 'Experienced GPs, dentists and specialists — backed by laboratory, pharmacy and telemedicine. Book in 60 seconds.'), cta_label: t('Booking Dokter', 'Book a Doctor'), cta_href: '/booking', cta2_label: t('Lihat Jadwal', 'See Schedules'), cta2_href: '/jadwal', image: '' },
        { type: 'stats', items: [{ value: '25.000+', label: t('Pasien dilayani', 'Patients served') }, { value: '40+', label: t('Dokter & tenaga medis', 'Doctors & medical staff') }, { value: '4,9/5', label: t('Rating kepuasan', 'Satisfaction rating') }, { value: '3', label: t('Cabang modern', 'Modern branches') }] },
        { type: 'services', title: t('Layanan unggulan', 'Featured services'), text: t('Satu tempat untuk seluruh kebutuhan kesehatan keluarga Anda.', 'One place for all your family\'s health needs.'), limit: 8 },
        { type: 'features', title: t('Mengapa Global Klinik?', 'Why Global Klinik?'), items: [{ icon: 'clock', title: t('Tanpa antre panjang', 'No long queues'), text: t('Booking slot, check-in QR, dan antrian digital real-time.', 'Slot booking, QR check-in and real-time digital queue.') }, { icon: 'shield', title: t('Aman & terstandar', 'Safe & accredited'), text: t('Protokol sterilisasi ketat dan rekam medis elektronik terenkripsi.', 'Strict sterilization and encrypted electronic records.') }, { icon: 'file', title: t('Dokumen digital', 'Digital documents'), text: t('Invoice, resep, dan hasil lab bisa diunduh kapan saja.', 'Invoices, prescriptions and lab results downloadable anytime.') }, { icon: 'video', title: t('Telemedicine', 'Telemedicine'), text: t('Konsultasi video dengan dokter dari mana saja.', 'Video consultations with doctors from anywhere.') }] },
        { type: 'doctors', title: t('Dokter kami', 'Our doctors'), text: t('Tim dokter berpengalaman dan berlisensi.', 'Experienced, licensed medical team.'), limit: 6 },
        { type: 'promos', title: t('Promo pilihan', 'Featured promotions'), limit: 3 },
        { type: 'testimonials', title: t('Cerita pasien kami', 'Patient stories'), limit: 6 },
        { type: 'branches', title: t('Kunjungi cabang terdekat', 'Visit your nearest branch') },
        { type: 'posts', title: t('Artikel kesehatan', 'Health articles'), limit: 3 },
        { type: 'faq', title: t('Pertanyaan umum', 'Frequently asked questions'), limit: 6 },
        { type: 'cta', title: t('Siap merasa lebih baik?', 'Ready to feel better?'), text: t('Booking dokter sekarang atau hubungi kami via WhatsApp.', 'Book a doctor now or chat with us on WhatsApp.'), cta_label: t('Booking sekarang', 'Book now'), cta_href: '/booking', cta2_label: t('Chat WhatsApp', 'WhatsApp us'), cta2_href: 'wa' },
      ],
    },
    {
      id: 'page-about', title: t('Tentang Kami', 'About Us'), slug: 'tentang', status: 'published', seo_description: t('Mengenal Global Klinik: visi, misi, dan nilai kami.', 'Get to know Global Klinik: our vision, mission and values.'),
      blocks: [
        { type: 'hero', eyebrow: t('Tentang Global Klinik', 'About Global Klinik'), title: t('Kesehatan tanpa batas, *untuk semua.*', 'Care without borders, *for everyone.*'), text: t('Sejak 2014 kami menghadirkan layanan kesehatan modern yang mudah diakses, transparan, dan manusiawi.', 'Since 2014 we have delivered modern healthcare that is accessible, transparent and humane.'), cta_label: t('Temui dokter kami', 'Meet our doctors'), cta_href: '/dokter', image: '' },
        { type: 'richtext', title: t('Visi & Misi', 'Vision & Mission'), text: t('**Visi** — Menjadi jaringan klinik terpercaya di Indonesia dengan standar pelayanan kelas dunia.\n\n**Misi**\n\n- Memberikan pelayanan medis yang aman, bermutu, dan berbasis bukti\n- Memanfaatkan teknologi digital untuk kemudahan pasien\n- Mengembangkan tenaga medis yang kompeten dan berempati\n- Menjangkau lebih banyak keluarga melalui cabang dan telemedicine', '**Vision** — To be Indonesia\'s most trusted clinic network with world-class service standards.\n\n**Mission**\n\n- Provide safe, high-quality, evidence-based care\n- Use digital technology to make care easier\n- Develop competent and compassionate medical staff\n- Reach more families through branches and telemedicine') },
        { type: 'stats', items: [{ value: '2014', label: t('Tahun berdiri', 'Founded') }, { value: '3', label: t('Cabang', 'Branches') }, { value: '40+', label: t('Tenaga medis', 'Medical staff') }, { value: '25.000+', label: t('Pasien', 'Patients') }] },
        { type: 'facilities', title: t('Fasilitas', 'Facilities') },
        { type: 'cta', title: t('Bergabung sebagai mitra korporat?', 'Become a corporate partner?'), text: t('Program MCU & layanan kesehatan karyawan dengan laporan terintegrasi.', 'Employee check-ups and healthcare with integrated reporting.'), cta_label: t('Hubungi kami', 'Contact us'), cta_href: '/kontak' },
      ],
    },
  ],

  holidays: [
    { id: 'hol-1', date: '2026-12-25', date_end: '', name: 'Hari Raya Natal', branch_id: '', doctor_id: '' },
    { id: 'hol-2', date: '2027-01-01', date_end: '', name: 'Tahun Baru 2027', branch_id: '', doctor_id: '' },
  ],

  rooms: [
    { id: 'rm-jkt-1', name: 'Ruang Periksa 1', branch_id: 'jkt', poli_id: 'umum', type: 'periksa', capacity: 1, active: true },
    { id: 'rm-jkt-2', name: 'Dental Suite', branch_id: 'jkt', poli_id: 'gigi', type: 'periksa', capacity: 2, active: true },
    { id: 'rm-jkt-3', name: 'Ruang Anak', branch_id: 'jkt', poli_id: 'anak', type: 'periksa', capacity: 1, active: true },
    { id: 'rm-jkt-lab', name: 'Laboratorium', branch_id: 'jkt', poli_id: '', type: 'lab', capacity: 3, active: true },
    { id: 'rm-bdg-1', name: 'Ruang Periksa 1', branch_id: 'bdg', poli_id: 'umum', type: 'periksa', capacity: 1, active: true },
    { id: 'rm-sby-1', name: 'Ruang Periksa 1', branch_id: 'sby', poli_id: 'umum', type: 'periksa', capacity: 1, active: true },
  ],

  procedures: [
    { id: 'pr-injeksi', code: 'TND-001', name: 'Injeksi intramuskular', category: 'Umum', poli_id: 'umum', price: 50000, branch_prices: [], performer: 'nurse', icd9: '99.29', active: true },
    { id: 'pr-nebu', code: 'TND-002', name: 'Nebulizer', category: 'Umum', poli_id: 'umum', price: 85000, branch_prices: [], performer: 'nurse', icd9: '93.94', active: true },
    { id: 'pr-luka', code: 'TND-003', name: 'Perawatan luka / ganti balutan', category: 'Umum', poli_id: 'umum', price: 75000, branch_prices: [], performer: 'nurse', icd9: '93.57', active: true },
    { id: 'pr-jahit', code: 'TND-004', name: 'Jahit luka (hecting) < 5 jahitan', category: 'Bedah minor', poli_id: 'umum', price: 175000, branch_prices: [], performer: 'doctor', icd9: '86.59', active: true },
    { id: 'pr-ekg', code: 'TND-005', name: 'Elektrokardiografi (EKG)', category: 'Diagnostik', poli_id: 'dalam', price: 150000, branch_prices: [], performer: 'nurse', icd9: '89.52', active: true },
    { id: 'pr-scaling', code: 'GIG-001', name: 'Scaling & polishing', category: 'Gigi', poli_id: 'gigi', price: 350000, branch_prices: [{ branch_id: 'bdg', price: 300000 }], performer: 'doctor', icd9: '96.54', active: true },
    { id: 'pr-tambal', code: 'GIG-002', name: 'Tambal komposit', category: 'Gigi', poli_id: 'gigi', price: 400000, branch_prices: [], performer: 'doctor', icd9: '23.2', active: true },
    { id: 'pr-cabut', code: 'GIG-003', name: 'Cabut gigi permanen', category: 'Gigi', poli_id: 'gigi', price: 450000, branch_prices: [], performer: 'doctor', icd9: '23.09', active: true },
    { id: 'pr-psa', code: 'GIG-004', name: 'Perawatan saluran akar (per kunjungan)', category: 'Gigi', poli_id: 'gigi', price: 750000, branch_prices: [], performer: 'doctor', icd9: '23.70', active: true },
    { id: 'pr-usg', code: 'KIA-001', name: 'USG kehamilan 2D', category: 'KIA', poli_id: 'kia', price: 250000, branch_prices: [], performer: 'doctor', icd9: '88.78', active: true },
    { id: 'pr-usg4d', code: 'KIA-002', name: 'USG 4D', category: 'KIA', poli_id: 'kia', price: 650000, branch_prices: [], performer: 'doctor', icd9: '88.78', active: true },
    { id: 'pr-imun', code: 'ANK-001', name: 'Imunisasi (jasa, belum termasuk vaksin)', category: 'Anak', poli_id: 'anak', price: 100000, branch_prices: [], performer: 'doctor', icd9: '99.59', active: true },
    { id: 'pr-peeling', code: 'KLT-001', name: 'Chemical peeling', category: 'Kulit', poli_id: 'kulit', price: 550000, branch_prices: [], performer: 'doctor', icd9: '86.24', active: true },
  ],

  lab_tests: [
    { id: 'lab-hb', code: 'HEM-01', name: 'Hemoglobin', category: 'Hematologi', unit: 'g/dL', ref_low: 12, ref_high: 17.5, ref_text: '12 – 17,5', price: 35000, loinc: '718-7', active: true },
    { id: 'lab-leu', code: 'HEM-02', name: 'Leukosit', category: 'Hematologi', unit: '10³/µL', ref_low: 4, ref_high: 11, ref_text: '4 – 11', price: 30000, loinc: '6690-2', active: true },
    { id: 'lab-trom', code: 'HEM-03', name: 'Trombosit', category: 'Hematologi', unit: '10³/µL', ref_low: 150, ref_high: 450, ref_text: '150 – 450', price: 30000, loinc: '777-3', active: true },
    { id: 'lab-ht', code: 'HEM-04', name: 'Hematokrit', category: 'Hematologi', unit: '%', ref_low: 36, ref_high: 52, ref_text: '36 – 52', price: 30000, loinc: '4544-3', active: true },
    { id: 'lab-gdp', code: 'KIM-01', name: 'Gula darah puasa', category: 'Kimia Klinik', unit: 'mg/dL', ref_low: 70, ref_high: 100, ref_text: '70 – 100', price: 35000, loinc: '1558-6', active: true },
    { id: 'lab-gds', code: 'KIM-02', name: 'Gula darah sewaktu', category: 'Kimia Klinik', unit: 'mg/dL', ref_low: 70, ref_high: 140, ref_text: '< 140', price: 30000, loinc: '2345-7', active: true },
    { id: 'lab-hba1c', code: 'KIM-03', name: 'HbA1c', category: 'Kimia Klinik', unit: '%', ref_low: 4, ref_high: 5.7, ref_text: '< 5,7', price: 185000, loinc: '4548-4', active: true },
    { id: 'lab-chol', code: 'KIM-04', name: 'Kolesterol total', category: 'Kimia Klinik', unit: 'mg/dL', ref_low: 0, ref_high: 200, ref_text: '< 200', price: 45000, loinc: '2093-3', active: true },
    { id: 'lab-ldl', code: 'KIM-05', name: 'Kolesterol LDL', category: 'Kimia Klinik', unit: 'mg/dL', ref_low: 0, ref_high: 130, ref_text: '< 130', price: 60000, loinc: '13457-7', active: true },
    { id: 'lab-hdl', code: 'KIM-06', name: 'Kolesterol HDL', category: 'Kimia Klinik', unit: 'mg/dL', ref_low: 40, ref_high: 999, ref_text: '> 40', price: 55000, loinc: '2085-9', active: true },
    { id: 'lab-tg', code: 'KIM-07', name: 'Trigliserida', category: 'Kimia Klinik', unit: 'mg/dL', ref_low: 0, ref_high: 150, ref_text: '< 150', price: 50000, loinc: '2571-8', active: true },
    { id: 'lab-ua', code: 'KIM-08', name: 'Asam urat', category: 'Kimia Klinik', unit: 'mg/dL', ref_low: 2.4, ref_high: 7, ref_text: '2,4 – 7,0', price: 40000, loinc: '3084-1', active: true },
    { id: 'lab-sgot', code: 'KIM-09', name: 'SGOT (AST)', category: 'Fungsi Hati', unit: 'U/L', ref_low: 0, ref_high: 40, ref_text: '< 40', price: 45000, loinc: '1920-8', active: true },
    { id: 'lab-sgpt', code: 'KIM-10', name: 'SGPT (ALT)', category: 'Fungsi Hati', unit: 'U/L', ref_low: 0, ref_high: 41, ref_text: '< 41', price: 45000, loinc: '1742-6', active: true },
    { id: 'lab-ureum', code: 'KIM-11', name: 'Ureum', category: 'Fungsi Ginjal', unit: 'mg/dL', ref_low: 10, ref_high: 50, ref_text: '10 – 50', price: 45000, loinc: '3094-0', active: true },
    { id: 'lab-kreat', code: 'KIM-12', name: 'Kreatinin', category: 'Fungsi Ginjal', unit: 'mg/dL', ref_low: 0.6, ref_high: 1.3, ref_text: '0,6 – 1,3', price: 45000, loinc: '2160-0', active: true },
    { id: 'lab-urin', code: 'URI-01', name: 'Urinalisis lengkap', category: 'Urinalisis', unit: '', ref_low: null, ref_high: null, ref_text: 'Normal', price: 55000, loinc: '24356-8', active: true },
  ],

  insurers: [
    { id: 'ins-bpjs', name: 'BPJS Kesehatan', type: 'bpjs', code: 'BPJS', contact: 'Kantor Cabang BPJS', phone: '165', email: '', discount_pct: 0, active: true },
    { id: 'ins-mitra', name: 'Asuransi Mitra Sehat', type: 'asuransi', code: 'AMS', contact: 'Divisi Klaim', phone: '(021) 555 0101', email: 'klaim@mitrasehat.example', discount_pct: 10, active: true },
    { id: 'ins-nusa', name: 'Nusantara Life', type: 'asuransi', code: 'NSL', contact: 'Provider Relation', phone: '(021) 555 0202', email: 'provider@nusantaralife.example', discount_pct: 5, active: true },
  ],

  medicine_categories: [
    { id: 'cat-analgesik', name: 'Analgesik & Antipiretik', description: 'Pereda nyeri & penurun demam' },
    { id: 'cat-antibiotik', name: 'Antibiotik', description: 'Wajib resep' },
    { id: 'cat-antihistamin', name: 'Antihistamin', description: 'Alergi' },
    { id: 'cat-gastro', name: 'Saluran Cerna', description: 'Antasida, PPI, antiemetik' },
    { id: 'cat-kardio', name: 'Kardiovaskular', description: 'Antihipertensi' },
    { id: 'cat-diabetes', name: 'Antidiabetes', description: 'Oral antidiabetik' },
    { id: 'cat-vitamin', name: 'Vitamin & Suplemen', description: '' },
    { id: 'cat-topikal', name: 'Topikal', description: 'Salep & krim' },
    { id: 'cat-vaksin', name: 'Vaksin', description: 'Imunisasi' },
  ],

  units: ['Tablet', 'Kapsul', 'Botol', 'Tube', 'Ampul', 'Vial', 'Sachet', 'Strip', 'Pcs'].map((n) => ({ id: 'u-' + n.toLowerCase(), name: n })),

  membership_tiers: [
    { id: 'tier-silver', name: 'Silver', min_points: 0, discount_pct: 0, color: '#94A3B8', benefits: t('Pengingat kontrol otomatis\nRiwayat medis digital', 'Automatic reminders\nDigital medical history') },
    { id: 'tier-gold', name: 'Gold', min_points: 100, discount_pct: 5, color: '#B8893B', benefits: t('Diskon 5% semua layanan\nPrioritas booking', '5% off all services\nPriority booking') },
    { id: 'tier-platinum', name: 'Platinum', min_points: 300, discount_pct: 10, color: '#0F766E', benefits: t('Diskon 10% semua layanan\nKonsultasi telemedicine gratis 2x/tahun', '10% off all services\n2 free telemedicine consults/year') },
  ],

  roles: [
    { id: 'superadmin', code: 'superadmin', name: 'Super Admin', description: 'Akses penuh ke seluruh sistem', home: 'dashboard', perms: ['*'], system: true },
    { id: 'admin', code: 'admin', name: 'Admin', description: 'Operasional & konten semua cabang', home: 'dashboard', perms: ['*', '!system:backup', '!roles:delete'], system: true },
    { id: 'manager', code: 'manager', name: 'Manajemen', description: 'Dashboard, laporan & analitik', home: 'dashboard', perms: ['dashboard:view', '*:view', 'reports:view', 'reports:export', '*:export'], system: true },
    { id: 'doctor', code: 'doctor', name: 'Dokter', description: 'Pemeriksaan & rekam medis', home: 'doctor', perms: ['dashboard:view', 'queue:call', 'clinic:examine', 'clinic:triage', 'patients:view', 'patients:update', 'appointments:view', 'appointments:update', 'visits:view', 'visits:update', 'medical_records:view', 'medical_records:create', 'medical_records:update', 'prescriptions:view', 'prescriptions:create', 'prescriptions:update', 'lab_orders:view', 'lab_orders:create', 'documents:view', 'documents:create', 'schedules:view', 'doctors:view', 'medicines:view', 'procedures:view', 'lab_tests:view', 'holidays:view', 'holidays:create'], system: true },
    { id: 'nurse', code: 'nurse', name: 'Perawat', description: 'Triase, tanda vital & tindakan', home: 'queue', perms: ['dashboard:view', 'queue:call', 'clinic:triage', 'clinic:register', 'patients:view', 'patients:update', 'visits:view', 'visits:update', 'medical_records:view', 'appointments:view', 'documents:view', 'documents:create', 'procedures:view'], system: true },
    { id: 'pharmacist', code: 'pharmacist', name: 'Apoteker', description: 'Farmasi & inventory', home: 'pharmacy', perms: ['dashboard:view', 'pharmacy:dispense', 'pharmacy:sale', 'pharmacy:stock', 'prescriptions:view', 'prescriptions:update', 'medicines:view', 'medicines:create', 'medicines:update', 'medicines:export', 'stock_batches:view', 'stock_batches:update', 'stock_moves:view', 'stock_moves:export', 'suppliers:view', 'suppliers:create', 'suppliers:update', 'purchase_orders:view', 'purchase_orders:create', 'purchase_orders:update', 'medicine_categories:view', 'medicine_categories:create', 'medicine_categories:update', 'units:view', 'units:create', 'units:update', 'patients:view', 'invoices:view', 'reports:view'], system: true },
    { id: 'cashier', code: 'cashier', name: 'Kasir', description: 'Billing & pembayaran', home: 'cashier', perms: ['dashboard:view', 'billing:cashier', 'billing:refund', 'invoices:view', 'invoices:create', 'invoices:update', 'invoices:export', 'payments:view', 'payments:create', 'payments:update', 'payments:export', 'refunds:view', 'refunds:create', 'claims:view', 'claims:create', 'claims:update', 'patients:view', 'visits:view', 'coupons:view', 'insurers:view', 'pharmacy:sale', 'medicines:view', 'reports:view'], system: true },
    { id: 'registration', code: 'registration', name: 'Pendaftaran', description: 'Registrasi pasien & antrian', home: 'queue', perms: ['dashboard:view', 'clinic:register', 'queue:call', 'patients:view', 'patients:create', 'patients:update', 'patients:export', 'appointments:view', 'appointments:create', 'appointments:update', 'visits:view', 'visits:create', 'visits:update', 'documents:view', 'documents:create', 'corporates:view', 'insurers:view', 'leads:view', 'leads:update'], system: true },
    { id: 'lab', code: 'lab', name: 'Laboratorium', description: 'Pemeriksaan laboratorium', home: 'lab', perms: ['dashboard:view', 'lab:process', 'lab_orders:view', 'lab_orders:create', 'lab_orders:update', 'lab_tests:view', 'lab_tests:create', 'lab_tests:update', 'patients:view', 'visits:view', 'documents:view', 'documents:create', 'reports:view'], system: true },
    { id: 'marketing', code: 'marketing', name: 'Marketing', description: 'Konten website, promo & CRM', home: 'dashboard', perms: ['dashboard:view', 'media:manage', 'pages:*', 'banners:*', 'services:view', 'services:update', 'promotions:*', 'testimonials:*', 'posts:*', 'faqs:*', 'facilities:*', 'pricing:*', 'coupons:*', 'leads:*', 'newsletter:*', 'membership_tiers:view', 'reports:view'], system: true },
    { id: 'patient', code: 'patient', name: 'Pasien', description: 'Portal pasien', home: 'portal', perms: [], system: true },
  ],
};

// Weekly schedules generated for every doctor/branch (editable later in Admin → Jadwal Praktik)
const plan = {
  'dr-andini': [['jkt', 'umum', [1, 2, 3, 4, 5], '08:00', '14:00'], ['jkt', 'umum', [6], '08:00', '12:00']],
  'dr-rizky': [['jkt', 'gigi', [1, 3, 5], '09:00', '15:00'], ['bdg', 'gigi', [2, 4], '10:00', '16:00']],
  'dr-sekar': [['jkt', 'anak', [1, 2, 4], '15:00', '20:00'], ['bdg', 'anak', [6], '09:00', '13:00']],
  'dr-hendra': [['jkt', 'dalam', [2, 4], '09:00', '13:00'], ['sby', 'dalam', [1, 3, 5], '15:00', '19:00']],
  'dr-maya': [['jkt', 'kia', [1, 3, 5], '16:00', '20:00'], ['sby', 'kia', [2, 6], '09:00', '13:00']],
  'dr-nadia': [['jkt', 'kulit', [2, 3, 4, 6], '11:00', '17:00']],
  'dr-bayu': [['bdg', 'umum', [1, 2, 3, 4, 5, 6], '08:00', '15:00']],
  'dr-larasati': [['sby', 'umum', [1, 2, 3, 4, 5, 6], '08:00', '15:00']],
};
let n = 0;
for (const [doc, rows] of Object.entries(plan)) {
  for (const [branch, poli, days, start, end] of rows) {
    for (const d of days) {
      SEED.schedules.push({ id: `sch-${++n}`, doctor_id: doc, branch_id: branch, poli_id: poli, day: String(d), start, end, slot_minutes: 20, quota_per_slot: 1, type: 'both', room_id: '', active: true });
    }
  }
}
