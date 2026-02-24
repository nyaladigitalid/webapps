const mockOrders = [
    {
        id: "1024",
        clientName: "Ahmad Fauzi",
        packageName: "Pro Pack v2",
        status: "active",
        progress_percent: 70,
        days_remaining: 5,
        repeat_order: true
    },
    {
        id: "1025",
        clientName: "Siska Amelia",
        packageName: "Starter Pack",
        status: "pending",
        progress_percent: 15,
        days_remaining: 12,
        repeat_order: false
    },
    {
        id: "1026",
        clientName: "Budi Santoso",
        packageName: "Enterprise",
        status: "active",
        progress_percent: 92,
        days_remaining: 2,
        repeat_order: true
    },
    {
        id: "1027",
        clientName: "Diana Lestari",
        packageName: "Pro Pack v2",
        status: "completed",
        progress_percent: 100,
        days_remaining: 0,
        repeat_order: false
    },
    {
        id: "1028",
        clientName: "Kevin Pratama",
        packageName: "Starter Pack",
        status: "active",
        progress_percent: 45,
        days_remaining: 8,
        repeat_order: false
    },
    {
        id: "1029",
        clientName: "Rina Wati",
        packageName: "Pro Pack v2",
        status: "pending",
        progress_percent: 0,
        days_remaining: 30,
        repeat_order: false
    },
    {
        id: "1030",
        clientName: "Eko Prasetyo",
        packageName: "Enterprise",
        status: "active",
        progress_percent: 60,
        days_remaining: 15,
        repeat_order: true
    },
    {
        id: "1031",
        clientName: "Sari Indah",
        packageName: "Starter Pack",
        status: "completed",
        progress_percent: 100,
        days_remaining: 0,
        repeat_order: true
    }
];

// Simulate API call
function getOrders() {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(mockOrders);
        }, 500);
    });
}
