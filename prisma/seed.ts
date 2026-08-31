import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { deriveShiftsFromWindow } from "../src/lib/shifts";
import { ensureWorkspace } from "../src/lib/workspace";

const db = new PrismaClient();

function trackCode(seed: string) {
  return `BR${seed.replace(/[^A-Z0-9]/gi, "").slice(-5).toUpperCase().padEnd(5, "X")}`;
}

function guessKind(nameAr: string, nameEn: string) {
  const text = `${nameAr} ${nameEn}`.toLowerCase();
  if (text.includes("تجربة") || text.includes("trial")) return "trial";
  if (text.includes("سهرة") || text.includes("evening")) return "evening";
  if (text.includes("حناء") || text.includes("henna")) return "henna";
  if (text.includes("شعر") || text.includes("hair") || text.includes("updo")) return "hair";
  if (text.includes("أظافر") || text.includes("nail")) return "nails";
  if (text.includes("عروس") || text.includes("bridal")) return "bridal";
  return "other";
}

async function backfill() {
  const services = await db.service.findMany();
  for (const service of services) {
    if (!service.kind || service.kind === "bridal") {
      const kind = guessKind(service.nameAr, service.nameEn);
      if (kind !== service.kind) {
        await db.service.update({ where: { id: service.id }, data: { kind } });
      }
    }
  }

  const bookings = await db.booking.findMany({ include: { items: true, service: true } });
  for (const booking of bookings) {
    if (booking.trackCode && booking.trackCode.length >= 6) continue;
    const pretty = trackCode(booking.id);
    const clash = await db.booking.findUnique({ where: { trackCode: pretty } });
    await db.booking.update({
      where: { id: booking.id },
      data: { trackCode: clash ? `BR${booking.id.slice(-8).toUpperCase()}` : pretty },
    });
    if (booking.items.length === 0 && booking.service) {
      await db.bookingItem.create({
        data: {
          bookingId: booking.id,
          serviceId: booking.service.id,
          nameAr: booking.service.nameAr,
          nameEn: booking.service.nameEn,
          durationMin: booking.service.durationMin,
          priceLyd: booking.service.priceLyd,
        },
      });
    }
  }

  await db.artist.updateMany({
    where: { phone: { in: ["218910000001", "218920000002"] } },
    data: { isDemo: true },
  });

  const billed = await db.booking.findMany({
    where: { origin: "public", status: { in: ["CONFIRMED", "COMPLETED"] }, platformFeeLyd: { gt: 0 } },
    include: { fee: true },
  });
  for (const booking of billed) {
    if (!booking.fee) {
      await db.platformFee.create({
        data: {
          artistId: booking.artistId,
          bookingId: booking.id,
          amountLyd: booking.platformFeeLyd,
          status: booking.feeStatus === "PAID" ? "PAID" : "UNPAID",
        },
      });
    }
  }
}

async function seedSaraBeauty(passwordHash: string) {
  const artists = await db.artist.findMany();
  for (const artist of artists) {
    await ensureWorkspace(artist);
  }

  const sara = await db.artist.upsert({
    where: { phone: "218930000003" },
    update: {},
    create: {
      name: "سارة بيوتي",
      phone: "218930000003",
      passwordHash,
      slug: "sara-beauty",
      bio: "مركز تجميل للعرائس في بنغازي. مكياج وشعر في نفس المكان.",
      specialty: "makeup,hair",
      neighborhood: "fuwayhat",
      whatsapp: "218930000003",
      onboardingComplete: true,
      isDemo: true,
    },
  });
  await db.artist.update({
    where: { id: sara.id },
    data: {
      name: "سارة",
      tagline: "مركز سارة بيوتي",
      onboardingComplete: true,
      isDemo: true,
    },
  });

  const workspace = await ensureWorkspace(await db.artist.findUniqueOrThrow({ where: { id: sara.id } }));
  await db.business.update({
    where: { id: workspace.business.id },
    data: {
      name: "سارة بيوتي",
      slug: "sara-beauty",
      businessType: "salon",
      scheduleMode: "SHIFT",
      assignmentMode: "AUTO",
    },
  });
  await db.artist.update({ where: { id: sara.id }, data: { slug: "sara-beauty" } });

  await db.weeklyHour.deleteMany({ where: { OR: [{ artistId: sara.id }, { businessId: workspace.business.id }] } });
  await db.weeklyHour.createMany({
    data: [4, 5, 6].map((dayOfWeek) => ({
      artistId: sara.id,
      businessId: workspace.business.id,
      dayOfWeek,
      startMin: 10 * 60,
      endMin: 22 * 60,
    })),
  });
  await db.shift.deleteMany({ where: { businessId: workspace.business.id } });
  await db.shift.createMany({
    data: deriveShiftsFromWindow(10 * 60, 22 * 60).map((shift) => ({
      businessId: workspace.business.id,
      key: shift.key,
      nameAr: shift.nameAr,
      nameEn: shift.nameEn,
      startMin: shift.startMin,
      endMin: shift.endMin,
      sortOrder: shift.sortOrder,
      active: true,
    })),
  });

  await db.teamMember.update({
    where: { id: workspace.member.id },
    data: { name: "سارة", dailyCapacity: 4, roles: "OWNER,MAKEUP_ARTIST" },
  });

  async function staffArtist(name: string, phone: string, slug: string) {
    return db.artist.upsert({
      where: { phone },
      update: {},
      create: {
        name,
        phone,
        passwordHash,
        slug,
        specialty: "makeup",
        neighborhood: "fuwayhat",
        whatsapp: phone,
        onboardingComplete: false,
        isDemo: true,
      },
    });
  }

  const huda = await staffArtist("هدى", "218930000004", "huda-sara");
  const aisha = await staffArtist("عائشة", "218930000005", "aisha-sara");
  const mona = await staffArtist("منى", "218930000006", "mona-sara");

  async function member(artist: { id: string; name: string; phone: string }, roles: string, capacity: number) {
    const existing = await db.teamMember.findFirst({
      where: { businessId: workspace.business.id, artistId: artist.id },
    });
    if (existing) {
      return db.teamMember.update({
        where: { id: existing.id },
        data: { name: artist.name, phone: artist.phone, roles, dailyCapacity: capacity, status: "ACTIVE" },
      });
    }
    return db.teamMember.create({
      data: {
        businessId: workspace.business.id,
        artistId: artist.id,
        name: artist.name,
        phone: artist.phone,
        roles,
        dailyCapacity: capacity,
        status: "ACTIVE",
      },
    });
  }

  const hudaMember = await member(huda, "MAKEUP_ARTIST", 3);
  const aishaMember = await member(aisha, "MAKEUP_ARTIST", 4);
  const monaMember = await member(mona, "HAIRSTYLIST", 5);

  async function service(nameAr: string, nameEn: string, kind: string, price: number, memberIds: string[]) {
    let row = await db.service.findFirst({ where: { businessId: workspace.business.id, nameAr } });
    if (!row) {
      row = await db.service.create({
        data: {
          artistId: sara.id,
          businessId: workspace.business.id,
          nameAr,
          nameEn,
          kind,
          durationMin: 120,
          priceLyd: price,
          active: true,
        },
      });
    }
    await db.teamMemberService.deleteMany({ where: { serviceId: row.id } });
    await db.teamMemberService.createMany({
      data: memberIds.map((teamMemberId) => ({ teamMemberId, serviceId: row!.id })),
    });
    return row;
  }

  await service("مكياج عروس", "Bridal Makeup", "bridal", 400, [workspace.member.id, hudaMember.id, aishaMember.id]);
  await service("تسريحة عروس", "Bridal Hair", "hair", 250, [monaMember.id]);
}

async function main() {
  const passwordHash = await bcrypt.hash("bridey123", 10);

  const lina = await db.artist.upsert({
    where: { phone: "218910000001" },
    update: {},
    create: {
      name: "لينا الفيتوري",
      phone: "218910000001",
      passwordHash,
      slug: "lina",
      bio: "مكياج عرائس ناعم وفخم من الفويهات. تجربة قبل الفرح، ويوم الفرح كامل.",
      specialty: "makeup",
      neighborhood: "fuwayhat",
      snapchat: "lina.bridal",
      whatsapp: "218910000001",
      onboardingComplete: true,
      isDemo: true,
      services: {
        create: [
          { nameAr: "مكياج عروس كامل", nameEn: "Full bridal glam", kind: "bridal", durationMin: 180, priceLyd: 450 },
          { nameAr: "تجربة المكياج", nameEn: "Makeup trial", kind: "trial", durationMin: 90, priceLyd: 180 },
          { nameAr: "مكياج سهرة", nameEn: "Evening makeup", kind: "evening", durationMin: 75, priceLyd: 150 },
        ],
      },
      hours: {
        create: [4, 5, 6, 0].map((dayOfWeek) => ({
          dayOfWeek,
          startMin: 10 * 60,
          endMin: 22 * 60,
        })),
      },
      portfolio: {
        create: [
          { url: "https://images.unsplash.com/photo-1519741497674-611481863552?w=900&q=80", caption: "عروس" },
          { url: "https://images.unsplash.com/photo-1520854221256-17451cc331bf?w=900&q=80", caption: "تفاصيل" },
          { url: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=900&q=80", caption: "إطلالة" },
        ],
      },
    },
  });

  await db.artist.upsert({
    where: { phone: "218920000002" },
    update: {},
    create: {
      name: "نور بن عمران",
      phone: "218920000002",
      passwordHash,
      slug: "noor",
      bio: "تسريحات عرائس ورفعات من قاريونس. شعرك يوصل جاهز لصورة العمر.",
      specialty: "hair",
      neighborhood: "garyounis",
      snapchat: "noor.hair",
      whatsapp: "218920000002",
      onboardingComplete: true,
      isDemo: true,
      services: {
        create: [
          { nameAr: "تسريحة عروس", nameEn: "Bridal updo", kind: "bridal", durationMin: 120, priceLyd: 280 },
          { nameAr: "شعر ورفعة سهرة", nameEn: "Evening styling", kind: "evening", durationMin: 75, priceLyd: 140 },
        ],
      },
      hours: {
        create: [3, 4, 5, 6].map((dayOfWeek) => ({
          dayOfWeek,
          startMin: 12 * 60,
          endMin: 21 * 60,
        })),
      },
      portfolio: {
        create: [
          { url: "https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?w=900&q=80", caption: "شعر" },
          { url: "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=900&q=80", caption: "عروس" },
        ],
      },
    },
  });

  await db.artist.update({
    where: { id: lina.id },
    data: {
      coverUrl: "https://images.unsplash.com/photo-1519741497674-611481863552?w=1400&q=80",
      avatarUrl: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=400&q=80",
      tagline: "مكياج عرائس ناعم من الفويهات",
      instagram: "lina.bridal",
      pageStyle: "ivory",
      accent: "gold",
      coverLayout: "wide",
      ctaLabel: "احجزي مع لينا",
      showHoursOnPage: true,
    },
  });

  const noor = await db.artist.findUnique({ where: { slug: "noor" } });
  if (noor) {
    await db.artist.update({
      where: { id: noor.id },
      data: {
        coverUrl: "https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?w=1400&q=80",
        avatarUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400&q=80",
        tagline: "تسريحات عرائس من قاريونس",
        instagram: "noor.hair",
        pageStyle: "ink",
        accent: "champagne",
        coverLayout: "split",
        ctaLabel: "احجزي تسريحة",
        showHoursOnPage: true,
      },
    });
  }

  const glam = await db.service.findFirst({ where: { artistId: lina.id, nameAr: "مكياج عروس كامل" } });
  if (glam) {
    const exists = await db.booking.findFirst({ where: { artistId: lina.id, bridePhone: "218913334455" } });
    const clash = await db.booking.findUnique({ where: { trackCode: "BRSARA1" } });
    if (exists) {
      if (!clash || clash.id === exists.id) {
        await db.booking.update({
          where: { id: exists.id },
          data: { trackCode: "BRSARA1", origin: "public", source: "bridey" },
        });
      }
    } else {
      const soon = new Date();
      soon.setDate(soon.getDate() + ((4 - soon.getDay() + 7) % 7 || 7));
      const y = soon.getFullYear();
      const m = String(soon.getMonth() + 1).padStart(2, "0");
      const d = String(soon.getDate()).padStart(2, "0");
      await db.booking.create({
        data: {
          artistId: lina.id,
          serviceId: glam.id,
          trackCode: clash ? `BRSARA${lina.id.slice(-2).toUpperCase()}` : "BRSARA1",
          origin: "public",
          source: "bridey",
          brideName: "سارة المسماري",
          bridePhone: "218913334455",
          notes: "الفرح في قاعة الأندلس، الساعة ٥ عصراً",
          date: `${y}-${m}-${d}`,
          startMin: 14 * 60,
          endMin: 17 * 60,
          status: "PENDING",
          items: {
            create: [
              {
                serviceId: glam.id,
                nameAr: glam.nameAr,
                nameEn: glam.nameEn,
                durationMin: glam.durationMin,
                priceLyd: glam.priceLyd,
              },
            ],
          },
        },
      });
    }
  }

  await backfill();
  await seedSaraBeauty(passwordHash);

  await db.artist.updateMany({
    where: { OR: [{ slug: { startsWith: "cap-" } }, { name: "اختبار سعة" }] },
    data: { onboardingComplete: false, isDemo: true },
  });

  await db.paymentSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      bankName: "مصرف التجارة والتنمية",
      accountName: "Bridey",
      accountNumber: "1234567890",
      instructions: "حوّلي المبلغ الظاهر بالضبط واحتفظي بإيصال التحويل.",
      supportedMethods: "BANK_TRANSFER,E_PAYMENT,CASH",
      reminderDays: 7,
    },
  });
  await db.admin.upsert({
    where: { email: "admin@bridey.ly" },
    update: {},
    create: {
      email: "admin@bridey.ly",
      name: "Bridey Admin",
      passwordHash: await bcrypt.hash("bridey-admin", 10),
    },
  });
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
