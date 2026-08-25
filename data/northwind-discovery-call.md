# Discovery Call: Northwind Freight

**SYNTHETIC DEMO MATERIAL. Not a real client, not a real call.**
Generated 2026-08-24 as a pipeline demonstration input. Every name, number and detail
below is invented. Do not treat anything here as a company fact.

Date: 2026-08-24
Attendees: A. Mercer (consultant), Dana Reyes (Founder / COO, Northwind Freight)
Duration: 34 minutes

---

**Consultant:** Thanks for making time. Before we get into solutions, walk me through the business. What does Northwind actually do day to day?

**Dana:** We are a regional freight brokerage. Sixty owner-operator drivers under contract, we do not own trucks. We sit between shippers who need a load moved and drivers who want the work. Mostly Midwest, some Texas lanes. About four hundred loads a month right now.

**Consultant:** And how does a load get from a shipper to a driver today?

**Dana:** Badly. A shipper emails or calls one of our three dispatchers. Dispatcher writes it on a whiteboard, then puts it into a spreadsheet, then starts calling drivers one at a time until somebody takes it. That is the whole system. The spreadsheet is the source of truth and it lives on one laptop.

**Consultant:** How long does it take to cover a load?

**Dana:** Depends on the lane. A good lane, twenty minutes of phone calls. A bad lane, two hours and sometimes we give it back to the shipper. That is the part that is killing us. Every load we hand back is money we already spent finding.

**Consultant:** What happens after a driver takes it?

**Dana:** Then it goes quiet, which is the other problem. The driver has the load. The shipper calls us every few hours asking where their freight is. We call the driver. Driver does not pick up because he is driving. We call the shipper back and say we are working on it. That is a full time job for one person and it produces nothing.

**Consultant:** So two problems. Covering the load, and knowing where it is once it is covered.

**Dana:** Right. And a third one I did not mention. Paperwork. When a driver delivers, he has to get a signature on the bill of lading, and then he has to get that piece of paper to us before we pay him. Some of them text a photo. Some of them mail it. Some of them lose it. We have drivers waiting three weeks to get paid because a piece of paper is in a truck somewhere. They hate it and honestly I would too.

**Consultant:** How do you pay them now?

**Dana:** Manual ACH out of our bank, every Friday, against whatever paperwork made it in by Wednesday. Our bookkeeper does it.

**Consultant:** Let me ask about the drivers themselves. What are they carrying, phone wise?

**Dana:** All over the place. Mostly Android, cheap ones. A few iPhones. Reception is genuinely bad on some of these routes, we lose people for an hour at a time through parts of Nebraska.

**Consultant:** That matters a lot for how we build this. If the app needs a live connection to work, it will fail exactly when they need it.

**Dana:** Yes. That is the thing nobody has understood when we talked to other people. One vendor showed us a beautiful dashboard that assumes the driver has five bars. That is not our reality.

**Consultant:** Understood. So paint me the picture. If this works perfectly a year from now, what is different?

**Dana:** Dispatcher posts a load once. The drivers who can actually take it, the right equipment, the right area, get told about it, and one of them takes it without a phone call. From that point I can see where that truck is without calling anybody, and the shipper can see it too, or at least gets told when things change. Driver delivers, takes a photo of the signed paperwork on his phone, and that starts the clock on getting paid. Nobody touches a spreadsheet.

**Consultant:** When you say the shipper can see it, do you mean a login for shippers?

**Dana:** I go back and forth on that. Some of them would love it. Some of them want a phone call and always will. I do not know if I want to build a whole portal on day one.

**Consultant:** That is a fair thing to be undecided about. We can stage it.

**Dana:** That would be my preference. Get our side working first.

**Consultant:** Tell me about the matching. When you say the right drivers get told, how do you decide who is right?

**Dana:** Equipment type first, that is hard. Dry van, reefer, flatbed. If a guy does not have a reefer he cannot take a reefer load, full stop. Then where he is or where he is going to be. Then honestly, who we like working with. Some drivers are reliable and some are not, and the dispatchers all know who is who but it is in their heads.

**Consultant:** Would you want that reliability piece captured in the system?

**Dana:** Eventually. I do not want to launch with a scoring system that ranks our drivers and then have that leak. That is a relationship problem waiting to happen.

**Consultant:** Noted, and I agree that is a later conversation.

**Dana:** The other thing is I do not want it to be an auction. I have seen the apps where a load gets blasted to everyone and it is a race. Our drivers are contractors but they are our people. I want it offered to a short list first.

**Consultant:** So an offer sequence rather than a free for all. A tier of drivers gets it, and if nobody takes it in some window, it opens wider.

**Dana:** That is exactly right, yes.

**Consultant:** What about the dispatchers? Three people. Are they going to use this?

**Dana:** Two will. One has been doing it on a whiteboard for eleven years and will fight me. But he is also the best one, so if the tool is worse than his whiteboard he is right to fight me.

**Consultant:** That is a real constraint and I would rather design for it than pretend. If it takes him longer to post a load than to write it on a board, it fails.

**Dana:** Yes.

**Consultant:** What about existing systems? Anything we have to talk to?

**Dana:** We use QuickBooks for the accounting side and I am not replacing that. The bookkeeper would quit. Beyond that, not really. The spreadsheet, which I would happily set on fire.

**Consultant:** Any compliance dimension? Hours of service, ELD mandate, anything like that?

**Dana:** The drivers have their own ELD devices, that is on them as contractors, and I want to keep it that way. I do not want to be responsible for their compliance. If we start tracking hours we become responsible for hours and my insurance guy will have opinions.

**Consultant:** That is a good instinct and it is a real legal line. We should be explicit about that boundary in the scope.

**Dana:** Please.

**Consultant:** Timeline and budget. What is driving this?

**Dana:** We have a shipper who is dangling a much bigger contract, and their question was basically can you handle volume. Right now the honest answer is no, because the spreadsheet breaks at maybe six hundred loads. They want an answer in the first quarter of next year. Budget I would rather talk about once I see what it costs, I do not want to anchor you.

**Consultant:** Fair. I will come back with scope and you can react to the number.

**Dana:** One more thing. I have been burned. We paid a developer forty thousand dollars two years ago and got a login screen and a lot of apologies. So whatever you send me, I need to be able to understand what I am buying.

**Consultant:** Then that is what I will send. Plain language, every piece of work named, and what is not included stated as clearly as what is.

**Dana:** That alone would be new.

**Consultant:** Let me confirm the open ones so I do not guess. Shipper visibility is undecided, you are leaning toward staging it. Driver reliability scoring is a later phase. Hours of service tracking is deliberately out. QuickBooks stays and we work around it. Anything I have wrong?

**Dana:** No, that is right. And the offer sequence rather than the auction, that one matters to me.

**Consultant:** Got it. I will have something to you this week.
