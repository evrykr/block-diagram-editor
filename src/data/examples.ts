import type { Language } from '../types/diagram';

export const CODE_EXAMPLES: Record<Language, { title: string; code: string }> = {
  python: {
    title: 'Сумма чётных чисел',
    code: `# Сумма чётных чисел от 1 до n
n = int(input("Введите n: "))
total = 0
for i in range(1, n + 1):
    if i % 2 == 0:
        total = total + i
print("Сумма:", total)
`,
  },
  pascal: {
    title: 'Сумма чётных чисел',
    code: `program SumEven;
var
  n, i, total: integer;
begin
  readln(n);
  total := 0;
  for i := 1 to n do
  begin
    if i mod 2 = 0 then
      total := total + i;
  end;
  writeln('Сумма: ', total);
end.
`,
  },
  cpp: {
    title: 'Сумма чётных чисел',
    code: `#include <iostream>
using namespace std;

int main() {
    int n;
    int total = 0;
    cout << "n = ";
    cin >> n;
    for (int i = 1; i <= n; i++) {
        if (i % 2 == 0) {
            total += i;
        }
    }
    cout << "Сумма: " << total << endl;
    return 0;
}
`,
  },
  csharp: {
    title: 'Сумма чётных чисел',
    code: `using System;

class Program
{
    static void Main()
    {
        Console.Write("n = ");
        int n = int.Parse(Console.ReadLine());
        int total = 0;
        for (int i = 1; i <= n; i++)
        {
            if (i % 2 == 0)
            {
                total += i;
            }
        }
        Console.WriteLine("Сумма: " + total);
    }
}
`,
  },
};

export const CODE_LANGUAGE_META: Record<
  Language,
  { label: string; extension: string; color: string; short: string }
> = {
  python: { label: 'Python', extension: 'py', color: '#3776ab', short: 'Py' },
  pascal: { label: 'Pascal', extension: 'pas', color: '#2f6db3', short: 'Pa' },
  cpp: { label: 'C++', extension: 'cpp', color: '#00599c', short: 'C++' },
  csharp: { label: 'C#', extension: 'cs', color: '#512bd4', short: 'C#' },
};
