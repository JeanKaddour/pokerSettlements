'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatGBP } from '@/lib/utils';
import Image from 'next/image';

interface Player {
  id: string;
  name: string;
  buyIn: number;
  cashOut: number;
}

interface Settlement {
  from: string;
  to: string;
  amount: number;
}

function calculateSettlements(players: Player[], imbalanceThreshold: number): Settlement[] {
  const { totalBuyIns, totalCashOuts } = calculateTotals(players);
  const imbalance = totalCashOuts - totalBuyIns;

  // Return empty array if imbalance exceeds threshold
  if (Math.abs(imbalance) > imbalanceThreshold) {
    return [];
  }

  let adjustedPlayers = [...players];
  if (Math.abs(imbalance) <= imbalanceThreshold && players.length > 0) {
    const adjustment = imbalance / players.length;
    adjustedPlayers = players.map(player => ({
      ...player,
      cashOut: Number((player.cashOut - adjustment).toFixed(2))
    }));
  }

  let balances = adjustedPlayers
    .map(player => ({
      id: player.id,
      name: player.name,
      balance: Number((player.cashOut - player.buyIn).toFixed(2))
    }))
    .filter(p => Math.abs(p.balance) > 0.01);

  const settlements: Settlement[] = [];

  while (balances.length > 1) {
    balances.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

    const debtor = balances[0].balance < 0 ? balances[0] : balances[1];
    const creditor = balances[0].balance > 0 ? balances[0] : balances[1];

    const amount = Math.min(Math.abs(debtor.balance), creditor.balance);

    if (amount > 0) {
      settlements.push({
        from: debtor.id,
        to: creditor.id,
        amount: Number(amount.toFixed(2))
      });
    }

    debtor.balance = Number((debtor.balance + amount).toFixed(2));
    creditor.balance = Number((creditor.balance - amount).toFixed(2));

    balances = balances.filter(p => Math.abs(p.balance) > 0.01);
  }

  return settlements;
}

function calculateTotals(players: Player[]) {
  return players.reduce(
    (acc, player) => ({
      totalBuyIns: acc.totalBuyIns + player.buyIn,
      totalCashOuts: acc.totalCashOuts + player.cashOut,
    }),
    { totalBuyIns: 0, totalCashOuts: 0 }
  );
}

function generateMarkdownReport(players: Player[], imbalanceThreshold: number): string {
  const { totalBuyIns, totalCashOuts } = calculateTotals(players);
  const settlements = calculateSettlements(players, imbalanceThreshold);
  const difference = totalCashOuts - totalBuyIns;
  const isBalanced = Math.abs(difference) < 0.01;
  const isWithinThreshold = Math.abs(difference) <= imbalanceThreshold;

  // Generate imbalance messages if needed
  const imbalanceMessages: string[] = [];
  if (!isBalanced) {
    if (isWithinThreshold) {
      imbalanceMessages.push(
        `Small imbalance of ${formatGBP(Math.abs(difference))} detected (within threshold)`
      );
    } else {
      imbalanceMessages.push(
        difference > 0
          ? `Cash-outs exceed buy-ins by ${formatGBP(difference)}`
          : `Buy-ins exceed cash-outs by ${formatGBP(Math.abs(difference))}`
      );
    }
  }

  const playerResults = players
    .map(p => `| ${p.name} | ${formatGBP(p.buyIn)} | ${formatGBP(p.cashOut)} | ${formatGBP(p.cashOut - p.buyIn)} |`)
    .join('\n');

  const settlementsList = settlements
    .map(s => `- ${players.find(p => p.id === s.from)?.name} pays ${players.find(p => p.id === s.to)?.name}: ${formatGBP(s.amount)}`)
    .join('\n');

  let report = `# Poker Game Settlement Report

## Player Results

| Player | Buy-in | Cash-out | Net |
|--------|---------|-----------|-----|
${playerResults}

**Total Buy-ins:** ${formatGBP(totalBuyIns)}
**Total Cash-outs:** ${formatGBP(totalCashOuts)}`;

  // Add game imbalance section if there are any messages
  if (imbalanceMessages.length > 0) {
    report += '\n\n## Game Imbalance\n';
    report += imbalanceMessages.map(msg => `- ${msg}`).join('\n');
  }

  report += '\n\n## Settlements Required\n\n';
  report += settlementsList;

  return report;
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    // You might want to add some UI feedback here
  } catch (err) {
    console.error('Failed to copy text: ', err);
  }
};

export default function Home() {
  const [players, setPlayers] = useState<Player[]>(() => {
    if (typeof window !== 'undefined') {
      const savedPlayers = localStorage.getItem('pokerPlayers');
      return savedPlayers ? JSON.parse(savedPlayers) : [];
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('pokerPlayers', JSON.stringify(players));
  }, [players]);

  const [newPlayerName, setNewPlayerName] = useState('');
  const [imbalanceThreshold, setImbalanceThreshold] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedThreshold = localStorage.getItem('imbalanceThreshold');
      return savedThreshold ? Number(savedThreshold) : 1;
    }
    return 1;
  });

  useEffect(() => {
    localStorage.setItem('imbalanceThreshold', String(imbalanceThreshold));
  }, [imbalanceThreshold]);

  const addPlayer = () => {
    if (!newPlayerName.trim()) return;

    const newPlayer: Player = {
      id: Date.now().toString(),
      name: newPlayerName.trim(),
      buyIn: 0,
      cashOut: 0
    };

    setSettlements([]);
    setPlayers([...players, newPlayer]);
    setNewPlayerName('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPlayer();
    }
  };

  const removePlayer = (id: string) => {
    setSettlements([]);
    setPlayers(players.filter(player => player.id !== id));
  };

  const updatePlayerAmount = (id: string, field: 'buyIn' | 'cashOut', value: number) => {
    setSettlements([]);
    setPlayers(players.map(player =>
      player.id === id ? { ...player, [field]: value } : player
    ));
  };

  const calculateNetAmount = (player: Player) => {
    return player.cashOut - player.buyIn;
  };

  const getPlayerName = (id: string) => {
    return players.find(p => p.id === id)?.name || '';
  };

  const getGameBalance = () => {
    const { totalBuyIns, totalCashOuts } = calculateTotals(players);
    const difference = totalCashOuts - totalBuyIns;
    return {
      totalBuyIns,
      totalCashOuts,
      difference,
      isBalanced: Math.abs(difference) < 0.01,
      isWithinThreshold: Math.abs(difference) <= imbalanceThreshold
    };
  };

  const resetGame = () => {
    if (window.confirm('Are you sure you want to reset the game? This will remove all players and settings.')) {
      setPlayers([]);
      setImbalanceThreshold(1);
      localStorage.removeItem('pokerPlayers');
      localStorage.removeItem('imbalanceThreshold');
    }
  };

  const hasGameState = () => {
    return players.length > 0 || imbalanceThreshold !== 1;
  };

  // Add this state for storing settlements
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  // Add this function to handle calculation
  const handleCalculateSettlements = () => {
    const newSettlements = calculateSettlements(players, imbalanceThreshold);
    setSettlements(newSettlements);
  };

  return (
    <div className="min-h-screen p-8">
      <main className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Image
                  src="/logo.png"
                  alt="PokerSettle Logo"
                  width={100}
                  height={100}
                  className="rounded-full"
                />
                <div>
                  <CardTitle className="text-2xl">Jean&apos;s PokerSettle</CardTitle>
                  <CardDescription>
                    Manage your poker game settlements with ease
                  </CardDescription>
                </div>
              </div>
              {hasGameState() && (
                <Button
                  variant="outline"
                  onClick={resetGame}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  Reset Game
                </Button>
              )}
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Add New Player</CardTitle>
              <CardDescription>Enter the player's name to add them to the game</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    type="text"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Player name"
                  />
                </div>
                <Button onClick={addPlayer}>
                  Add Player
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Game Configuration</CardTitle>
              <CardDescription>
                Set the threshold for automatic imbalance distribution
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="threshold">
                    Imbalance Threshold (£)
                  </Label>
                  <div className="flex gap-4 items-center">
                    <Input
                      id="threshold"
                      type="number"
                      value={imbalanceThreshold}
                      onChange={(e) => setImbalanceThreshold(Number(e.target.value))}
                      min="0"
                      step="0.1"
                      className="max-w-[200px]"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    If the game imbalance is within this threshold, it can be automatically distributed equally among all players.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {players.map(player => (
            <Card key={player.id}>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{player.name}</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removePlayer(player.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8"
                  >
                    Remove
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pb-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`buyIn-${player.id}`}>Buy-in Amount</Label>
                    <Input
                      id={`buyIn-${player.id}`}
                      type="number"
                      value={player.buyIn || 0}
                      onChange={(e) => updatePlayerAmount(player.id, 'buyIn', Number(e.target.value))}
                      min="0"
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`cashOut-${player.id}`}>Cash-out Amount</Label>
                    <Input
                      id={`cashOut-${player.id}`}
                      type="number"
                      value={player.cashOut || 0}
                      onChange={(e) => updatePlayerAmount(player.id, 'cashOut', Number(e.target.value))}
                      min="0"
                      className="h-8"
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-2 pb-4">
                <div className="text-base font-semibold">
                  Net: {formatGBP(calculateNetAmount(player))}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
        {players.length > 0 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Game Balance</CardTitle>
                <CardDescription>
                  Verify that total buy-ins match total cash-outs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const { totalBuyIns, totalCashOuts, difference, isBalanced, isWithinThreshold } = getGameBalance();
                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Total Buy-ins</div>
                          <div className="text-lg font-semibold">{formatGBP(totalBuyIns)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Total Cash-outs</div>
                          <div className="text-lg font-semibold">{formatGBP(totalCashOuts)}</div>
                        </div>
                      </div>

                      <div className={`p-3 rounded-lg ${isBalanced
                        ? 'bg-green-50 text-green-700'
                        : isWithinThreshold
                          ? 'bg-yellow-50 text-yellow-700'
                          : 'bg-red-50 text-red-700'
                        }`}>
                        {isBalanced ? (
                          <div className="font-medium">Game is balanced ✓</div>
                        ) : isWithinThreshold ? (
                          <div>
                            <div className="font-medium">Small imbalance detected</div>
                            <div className="text-sm mt-1">
                              Difference of {formatGBP(Math.abs(difference))} is within threshold and can be distributed
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-medium">Game is not balanced!</div>
                            <div className="text-sm mt-1">
                              {difference > 0
                                ? `Cash-outs exceed buy-ins by ${formatGBP(difference)}`
                                : `Buy-ins exceed cash-outs by ${formatGBP(Math.abs(difference))}`
                              }
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Settlements</CardTitle>
                  <CardDescription>
                    Recommended transfers to settle the game
                  </CardDescription>
                </div>
                <Button onClick={handleCalculateSettlements}>
                  Calculate Settlements
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {settlements.length > 0 ? (
                    settlements.map((settlement, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <span className="font-medium">{getPlayerName(settlement.from)}</span>
                          <span className="mx-2">pays</span>
                          <span className="font-medium">{getPlayerName(settlement.to)}</span>
                        </div>
                        <div className="font-mono font-semibold">
                          {formatGBP(settlement.amount)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground py-4">
                      Click the button above to calculate settlements
                    </div>
                  )}

                  <Card className="mt-6">
                    <CardHeader>
                      <CardTitle className="text-sm">Markdown Report</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="bg-slate-50 p-4 rounded-lg text-sm overflow-x-auto">
                        {generateMarkdownReport(players, imbalanceThreshold)}
                      </pre>
                      <Button
                        className="w-full mt-4"
                        onClick={() => copyToClipboard(generateMarkdownReport(players, imbalanceThreshold))}
                      >
                        Copy to Clipboard
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
