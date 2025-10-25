const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function checkMLLogs() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully\n');

    const db = mongoose.connection.db;
    const mlLogs = db.collection('mlperformancelogs');

    // Get total count
    const count = await mlLogs.countDocuments({});
    console.log(`📊 Total ML performance logs: ${count}`);

    if (count > 0) {
      // Get recent logs
      console.log('\n📝 Recent ML decisions (last 10):');
      const recent = await mlLogs.find().sort({ timestamp: -1 }).limit(10).toArray();
      for (const log of recent) {
        const timestamp = log.timestamp ? new Date(log.timestamp).toISOString() : 'N/A';
        const decision = log.decision || 'N/A';
        const symbol = log.symbol || 'N/A';
        const confidence = log.confidence !== undefined ? log.confidence.toFixed(3) : 'N/A';
        const playbook = log.playbook || 'N/A';
        console.log(`  ${timestamp} | ${decision.padEnd(10)} | ${symbol.padEnd(8)} | Playbook: ${playbook} | Confidence: ${confidence}`);
      }

      // Get decision breakdown
      const approved = await mlLogs.countDocuments({ decision: 'APPROVED' });
      const rejected = await mlLogs.countDocuments({ decision: 'REJECTED' });
      const approvalRate = count > 0 ? ((approved / count) * 100).toFixed(1) : 'N/A';

      console.log('\n📈 Decision breakdown:');
      console.log(`  ✅ Approved: ${approved}`);
      console.log(`  ❌ Rejected: ${rejected}`);
      console.log(`  📊 Approval rate: ${approvalRate}%`);

      // Get rejection reasons if any
      if (rejected > 0) {
        console.log('\n🚫 Top rejection reasons:');
        const rejectionReasons = await mlLogs.aggregate([
          { $match: { decision: 'REJECTED' } },
          { $group: { _id: '$rejectionReason', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).toArray();

        for (const reason of rejectionReasons) {
          console.log(`  - ${reason._id || 'Unknown'}: ${reason.count}`);
        }
      }

      // Get playbook breakdown
      console.log('\n📚 Playbook breakdown:');
      const playbookBreakdown = await mlLogs.aggregate([
        { $group: { _id: '$playbook', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();

      for (const pb of playbookBreakdown) {
        console.log(`  ${pb._id || 'Unknown'}: ${pb.count}`);
      }

      // Progress toward 1000+ signals
      console.log(`\n🎯 Progress toward Phase 4 threshold:`);
      console.log(`  Current: ${count} / 1000 signals`);
      console.log(`  Progress: ${((count / 1000) * 100).toFixed(1)}%`);
      if (count < 1000) {
        console.log(`  Remaining: ${1000 - count} signals needed`);
      } else {
        console.log(`  ✅ Ready for Phase 4 ML retraining!`);
      }

    } else {
      console.log('\n⚠️  No ML logs found yet - bot may need more time to generate signals');
      console.log('   The bot scans every 50 seconds and generates signals based on market conditions');
    }

  } catch (error) {
    console.error('❌ Error checking ML logs:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkMLLogs();

